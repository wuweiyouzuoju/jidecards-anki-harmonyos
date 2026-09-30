// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { NoteFieldCard } from '../common/NoteFieldCard';
import { NoteEditorHeader } from '../common/NoteEditorHeader';
import { PAGE_SURFACE_KEY } from '../../model/ThemeCatalog';
import { DECK_LIST_NARROW_KEY } from '../../model/DeckListAppearance';
import { NoteFieldImage } from '../../model/NoteImageDraft';
import { noteDraftChanged, parseNoteTags } from '../../model/NoteFieldEditing';
import { confirmNoteDiscard } from '../../utils/ConfirmNoteDiscard';
import { resourceText } from '../../utils/UiFeedback';
import { 从图库选取图片 } from '../../utils/文件导入助手';



// 独立编辑页的表单：拥有字段/标签/附件草稿和放弃确认，读写由宿主页负责。
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';

@Component
export struct 浏览编辑区 {
  @StorageProp(PAGE_SURFACE_KEY) private pageSurface: string = '#F5F7FA';
  @StorageProp(DECK_LIST_NARROW_KEY) private narrow: boolean = false;
  @StorageProp('导航条高度') private navigationBarHeight: number = 0;
  @Prop @Watch('requestClose') backRequest: number = 0;
  @Prop clozeFieldOrds: number[] = [];
  @Prop optionalReverseFieldOrd: number = -1;
  @State private images: NoteFieldImage[] = [];
  @State private pickingImage: boolean = false;
  @State private confirmingClose: boolean = false;
  private nextImageId: number = 0;
  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  @Prop errorMessage: string = '';
  @Prop originalStockKind: number = 0;
  @Prop fieldNames: string[] = [];
  @Prop initialFieldValues: string[] = [];
  @Prop initialTags: string = '';
  onCancel: () => void = (): void => {};
  onSave: (fields: string[], tags: string[], images: NoteFieldImage[]) => Promise<boolean> =
    async (_fields: string[], _tags: string[], _images: NoteFieldImage[]): Promise<boolean> => false;

  @State private fieldValues: string[] = [];
  @State private tags: string = '';
  @State private 本地错误: string = '';
  private disposed: boolean = false;

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @StorageProp(颜色键.主色按钮按下) private 主色按钮按下: string = '#1E4FB8';

  aboutToAppear(): void {
    // 从父级传入的初始值拷贝到内部状态（仅初始化，后续编辑不影响 initialFieldValues）
    this.fieldValues = this.initialFieldValues.slice();
    this.tags = this.initialTags;
  }

  aboutToDisappear(): void { this.disposed = true; }

  private 更新字段(索引: number, 值: string): void {
    const 新值 = this.fieldValues.slice();
    新值[索引] = 值;
    this.fieldValues = 新值;
  }

  /** 把 tags 输入串按空白拆分、去空、去重，返回标签数组。 */
  private 解析标签(): string[] {
    return parseNoteTags(this.tags);
  }

  /** 提交：调 onSave 上抛字段/标签；失败时草稿保留，由父级 errorMessage 提示。 */
  private async 提交(): Promise<void> {
    if (this.busy || this.pickingImage || this.confirmingClose || this.fieldNames.length === 0) {
      return;
    }
    this.本地错误 = '';
    try {
      // 保存后的导航由页面唯一持有，不能再触发取消回调导致二次 pop。
      await this.onSave(this.fieldValues.slice(), this.解析标签(), this.images.slice());
    } catch (_错误) {
      // 父级通过 errorMessage 提供本地化错误文案；草稿保留
    }
  }

  private async requestClose(): Promise<void> {
    if (this.busy || this.pickingImage || this.confirmingClose || this.disposed) return;
    if (this.images.length === 0 && !noteDraftChanged(this.fieldValues, this.initialFieldValues, this.tags, this.initialTags)) {
      this.onCancel(); return;
    }
    this.confirmingClose = true;
    const discard: boolean = await confirmNoteDiscard(this.getUIContext());
    if (this.disposed) return;
    this.confirmingClose = false;
    if (discard && !this.disposed && !this.busy) this.onCancel();
  }

  private async pickImage(index: number): Promise<void> {
    if (this.busy || this.pickingImage || this.confirmingClose || this.disposed) return;
    this.pickingImage = true;
    this.本地错误 = '';
    try {
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      const uri: string | null = await 从图库选取图片(context);
      if (this.disposed || uri === null) return;
      this.images = [...this.images, { id: ++this.nextImageId, fieldIndex: index, uri: uri, filename: '' }];
    } catch (error) {
      if (!this.disposed) this.本地错误 = resourceText(this.getUIContext(), $r('app.string.add_note_image_import_failed'));
    } finally { if (!this.disposed) this.pickingImage = false; }
  }

  build() {
    Column() {
      NoteEditorHeader({ title: $r('app.string.note_editor_edit_title'),
        actionLabel: this.busy ? $r('app.string.browser_detail_saving') : $r('app.string.browser_detail_save'),
        actionEnabled: !this.busy && !this.pickingImage && !this.confirmingClose && this.fieldNames.length > 0,
        closeEnabled: !this.busy && !this.pickingImage && !this.confirmingClose, accent: this.主色按钮背景,
        onBack: (): void => { this.requestClose(); }, onSave: (): void => { this.提交(); } })
      Scroll() {
        Column({ space: 应用尺寸.间距_14 }) {
          ForEach(this.fieldNames, (name: string, index: number) => {
            NoteFieldCard({ fieldName: name, originalStockKind: this.originalStockKind, value: this.fieldValues[index] ?? '',
              disabled: this.busy || this.pickingImage || this.confirmingClose,
              reverseToggle: index === this.optionalReverseFieldOrd, editing: true,
              isDark: this.isDark, accent: this.主色按钮背景,
              clozeEnabled: this.clozeFieldOrds.indexOf(index) >= 0, allFields: this.fieldValues,
              images: this.images.filter((item: NoteFieldImage): boolean => item.fieldIndex === index),
              onChange: (value: string): void => { this.更新字段(index, value); },
              onAddImage: (): void => { this.pickImage(index); },
              onRemoveImage: (id: number): void => {
                this.images = this.images.filter((image: NoteFieldImage): boolean => image.id !== id);
              } })
          }, (name: string, index: number): string => `${index}-${name}`)
          Column({ space: 应用尺寸.间距_8 }) {
            Text($r('app.string.browser_detail_tags')).fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary')).width('100%')
            TextInput({ placeholder: $r('app.string.browser_detail_tags_placeholder'), text: this.tags })
              .width('100%').height(应用尺寸.按钮高度).fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_primary')).placeholderColor($r('app.color.text_tertiary'))
              .backgroundColor($r('app.color.surface_card'))
              .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
              .borderRadius(应用尺寸.圆角_面板).padding({ left: 10, right: 10 })
              .enabled(!this.busy && !this.pickingImage && !this.confirmingClose)
              .onChange((value: string): void => { this.tags = value; })
          }.width('100%')
        }.width('100%')
      }.width('100%').layoutWeight(1).scrollBar(BarState.Auto).edgeEffect(EdgeEffect.Spring)
        .align(Alignment.TopStart)
        .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
          top: 应用尺寸.页面内容顶部间距(this.narrow) })
      if (this.errorMessage !== '' || this.本地错误 !== '') {
        Text(this.errorMessage !== '' ? this.errorMessage : this.本地错误)
          .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text'))
          .width('100%').maxLines(3).padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平 })
      }
      Column().height(应用尺寸.间距_8 + this.navigationBarHeight).flexShrink(0)
    }.width('100%').height('100%').backgroundColor(this.pageSurface)
  }
}
