// SPDX-License-Identifier: AGPL-3.0-or-later
import { DEFAULT_PROFILE_AVATAR, isProfilePhoto, profileAvatarSymbol } from '../../model/AccountProfile';
import { appearanceElementColor } from '../../utils/AppearanceElements';

/** 账号头像：照片优先，未设置时显示默认符号。 */
@Component
export struct ProfileAvatarImage {
  @Prop avatar: string = DEFAULT_PROFILE_AVATAR;
  @Prop allowHuaweiPhoto: boolean = false;
  @Prop diameter: number = 40;
  @StorageProp('appearance_elements_active') private appearanceElements: string = '';

  build() {
    Stack() {
      Text(profileAvatarSymbol(this.avatar) || profileAvatarSymbol(DEFAULT_PROFILE_AVATAR)).fontSize(this.diameter * 0.5)
      if (isProfilePhoto(this.avatar) || (this.allowHuaweiPhoto && this.avatar.startsWith('https://'))) {
        Image(this.avatar).width(this.diameter).height(this.diameter).objectFit(ImageFit.Cover)
      }
    }.width(this.diameter).height(this.diameter)
      .borderRadius(this.diameter / 2).clip(true)
      .backgroundColor(appearanceElementColor(this.appearanceElements, 'surface_page', $r('app.color.surface_page')))
      .accessibilityLevel('no')
  }
}
