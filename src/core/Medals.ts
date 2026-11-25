// SPDX-License-Identifier: AGPL-3.0-or-later
/** 系列徽章定义、外观与颁发准备；资格判断和原子持久化由可信共享宿主拥有。 */
export interface MedalArtwork {
  motif: string;
  colorStep: number;
  ordinal?: number;
}

export interface MedalDefinition {
  id: string;
  version: string;
  category: string;
  name: string;
  condition: string;
  status: string;
  artwork: MedalArtwork;
}

export interface MedalAwardRequest {
  accountId: string;
  productId: string;
  eventId: string;
  issuerId: string;
  eligibilityId: string;
  awardedAt: number;
  reason: string;
}

export interface MedalAward extends MedalAwardRequest {
  medalId: string;
  definitionVersion: string;
  category: string;
}

export interface MedalAwardResult {
  award: MedalAward;
  changed: boolean;
}

interface MedalColor {
  label: string;
  ink: string;
  face: string;
}

function positive(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) { throw new Error('Invalid ' + name); }
}

function nonempty(value: string, name: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) { throw new Error('Invalid ' + name); }
}

/** 已采纳色阶。到达幻彩后保持特殊材质，不回绕为普通色；枚序继续增长。 */
function medalColor(step: number, dark: boolean): MedalColor {
  positive(step, 'medal color step');
  const labels: string[] = ['素灰', '青绿', '湛蓝', '晶紫', '鎏金', '橙金', '绯红', '幻彩'];
  const inks: string[] = dark ?
    ['#B5BDC8', '#74CEA5', '#8AB4FF', '#C6A0F0', '#EAC575', '#EDA679', '#F192AA', '#CAA7F3'] :
    ['#647080', '#25805C', '#356CC7', '#8650B9', '#A27319', '#BA612B', '#BC435F', '#7D56BD'];
  const faces: string[] = dark ?
    ['#2B313B', '#203C31', '#213653', '#382C49', '#403622', '#453023', '#422A34', '#322B48'] :
    ['#F0F2F4', '#E9F6EF', '#EBF2FE', '#F2ECFA', '#FFF4D9', '#FFF0E4', '#FCEBF0', '#F5EDFE'];
  const index: number = Math.min(step, labels.length) - 1;
  return { label: labels[index], ink: inks[index], face: faces[index] };
}

export function medalColorLabel(step: number): string { return medalColor(step, false).label; }

export function medalInk(step: number, dark: boolean = false): string { return medalColor(step, dark).ink; }

/** 枚序使用汉字大写，独立于等级标签（Lv.2 等）和徽章门槛。 */
export function medalNumeral(ordinal: number): string {
  positive(ordinal, 'medal ordinal');
  const digits: string[] = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const units: string[] = ['', '拾', '佰', '仟'];
  const groups: string[] = ['', '万', '亿', '万亿'];
  let remaining: number = ordinal;
  const parts: number[] = [];
  while (remaining > 0) {
    parts.push(remaining % 10000);
    remaining = Math.floor(remaining / 10000);
  }
  let output: string = '';
  let gap: boolean = false;
  for (let group: number = parts.length - 1; group >= 0; group--) {
    const part: number = parts[group];
    if (part > 0) {
      let section: string = '';
      let zero: boolean = false;
      for (let place: number = 3; place >= 0; place--) {
        const digit: number = Math.floor(part / Math.pow(10, place)) % 10;
        if (digit === 0) { zero = section.length > 0; }
        else {
          section += (zero ? '零' : '') + digits[digit] + units[place];
          zero = false;
        }
      }
      output += (output.length > 0 && (gap || part < 1000) ? '零' : '') + section + groups[group];
      gap = false;
    } else if (output.length > 0) { gap = true; }
  }
  return output;
}

function validateArtwork(artwork: MedalArtwork): void {
  positive(artwork.colorStep, 'medal color step');
  if (!['number', 'commemorative', 'contribution'].includes(artwork.motif)) {
    throw new Error('Unsupported medal motif');
  }
  if (artwork.motif === 'number') {
    if (artwork.ordinal === undefined) { throw new Error('Missing medal ordinal'); }
    positive(artwork.ordinal, 'medal ordinal');
  }
}

export function validateMedalDefinition(definition: MedalDefinition): void {
  nonempty(definition.id, 'medal id');
  nonempty(definition.version, 'medal definition version');
  nonempty(definition.category, 'medal category');
  nonempty(definition.name, 'medal name');
  nonempty(definition.condition, 'medal condition');
  if (!['draft', 'approved'].includes(definition.status)) { throw new Error('Invalid medal status'); }
  validateArtwork(definition.artwork);
}

function gradient(id: string, colors: string[]): string {
  let svg: string = '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" ' +
    'x1="0" y1="0" x2="128" y2="140">';
  for (let index: number = 0; index < colors.length; index++) {
    svg += '<stop offset="' + (index * 100 / (colors.length - 1)) + '%" stop-color="' + colors[index] + '"/>';
  }
  return svg + '</linearGradient>';
}

/** 系列统一圆章轮廓，颜色表达档次，独立中心图形表达类别。 */
export function medalSvg(artwork: MedalArtwork, dark: boolean = false, includeNumber: boolean = true): string {
  validateArtwork(artwork);
  const color: MedalColor = medalColor(artwork.colorStep, dark);
  const prismatic: boolean = artwork.colorStep >= 8;
  const ink: string = prismatic ? 'url(#medal-edge)' : color.ink;
  const face: string = prismatic ? 'url(#medal-face)' : color.face;
  const definitions: string = prismatic ? '<defs>' + gradient('medal-edge', dark ?
    ['#E8CA85', '#ED9FB7', '#BC9BF0', '#8CC5F1'] : ['#AD7D29', '#C35B85', '#8B5BC1', '#377EB7']) +
    gradient('medal-face', dark ? ['#403725', '#412C3D', '#322D4B', '#23394A'] :
      ['#FFF2D6', '#FBE9F1', '#F0E9FC', '#E7F2FD']) + '</defs>' : '';
  let center: string;
  if (artwork.motif === 'number' && !includeNumber) {
    // 鸿蒙 SVG 子集不支持 text；公共 ArkUI 图案组件使用同色原生 Text 叠放。
    center = '';
  } else if (artwork.motif === 'number') {
    const ordinal: number = artwork.ordinal ?? 1;
    const numeral: string = medalNumeral(ordinal);
    center = '<text x="64" y="55" text-anchor="middle" dominant-baseline="middle" ' +
      'font-family="sans-serif" font-weight="600" font-size="' + Math.min(40, Math.floor(60 / numeral.length)) +
      '" fill="' + color.ink + '">' + numeral + '</text>';
  } else if (artwork.motif === 'commemorative') {
    // 四芒纪念星与数字等级明确区分，中央区域留出完整间隙。
    center = '<path d="M64 31L70 48L87 54L70 60L64 77L58 60L41 54L58 48Z" fill="' + color.ink + '"/>';
  } else {
    center = '<path d="M64 31L71 46L88 48L76 60L79 77L64 69L49 77L52 60L40 48L57 46Z" ' +
      'fill="' + color.ink + '"/>';
  }
  return '<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->' +
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 140">' + definitions +
    '<g stroke="' + ink + '" stroke-width="4.5" stroke-linejoin="round">' +
    '<path d="M35 84L26 126L46 116L60 130L65 91" fill="' + face + '"/>' +
    '<path d="M63 91L68 130L82 116L102 126L93 84" fill="' + face + '"/>' +
    '<circle cx="64" cy="54" r="44" fill="' + face + '"/>' +
    '<circle cx="64" cy="54" r="35" fill="none" opacity="0.22" stroke-width="2.5"/>' +
    '</g>' + center + '</svg>';
}

/** 保留既有源码入口签名；翻倍徽章的第 n 枚使用第 n 色阶。 */
export function levelMedalSvg(ordinal: number, dark: boolean = false, includeNumber: boolean = true): string {
  return medalSvg({ motif: 'number', colorStep: ordinal, ordinal: ordinal }, dark, includeNumber);
}

/** 门槛和稳定 ID 来自 DoublingLevelMilestones，定义本身不重算另一套等级规则。 */
export function levelMedalDefinition(id: string, ordinal: number, level: number): MedalDefinition {
  nonempty(id, 'level medal id');
  positive(ordinal, 'medal ordinal');
  positive(level, 'medal level');
  return { id: id, version: '1', category: 'level', name: '成长徽章 · ' + medalColorLabel(ordinal),
    condition: '历史最高达到 Lv.' + level, status: 'approved',
    artwork: { motif: 'number', colorStep: ordinal, ordinal: ordinal } };
}

function validateRequest(request: MedalAwardRequest): void {
  nonempty(request.accountId, 'medal account id');
  nonempty(request.productId, 'medal source product');
  nonempty(request.eventId, 'medal source event');
  nonempty(request.issuerId, 'medal issuer');
  nonempty(request.eligibilityId, 'medal eligibility decision');
  nonempty(request.reason, 'medal reason');
  if (!Number.isSafeInteger(request.awardedAt) || request.awardedAt < 0) {
    throw new Error('Invalid medal award time');
  }
}

export function validateMedalAward(award: MedalAward): void {
  validateRequest(award);
  nonempty(award.medalId, 'awarded medal id');
  nonempty(award.definitionVersion, 'awarded medal definition version');
  nonempty(award.category, 'awarded medal category');
}

/**
 * 佩戴只从当前账户已拥有的徽章选择，不颁发、不改变等级。
 * 未设置偏好沿用最后获得的成长徽章；空字符串表示主动不佩戴。
 * 宿主保存显式选择后，新获得徽章不会覆盖它。旧钱包可省略该字段。
 */
export function resolveWornMedalId(accountId: string, owned: MedalAward[], preference?: string): string {
  nonempty(accountId, 'medal account id');
  const ids: string[] = [];
  let fallback: string = '';
  for (const award of owned) {
    validateMedalAward(award);
    if (award.accountId !== accountId || ids.includes(award.medalId)) {
      throw new Error('Inconsistent medal ownership');
    }
    ids.push(award.medalId);
    if (award.category === 'level') { fallback = award.medalId; }
  }
  if (preference === undefined) { return fallback; }
  if (typeof preference !== 'string' || (preference !== '' && !ids.includes(preference))) {
    throw new Error('Cannot wear an unowned medal');
  }
  return preference;
}

function copyAward(award: MedalAward): MedalAward {
  return { accountId: award.accountId, medalId: award.medalId, definitionVersion: award.definitionVersion,
    category: award.category, productId: award.productId, eventId: award.eventId, issuerId: award.issuerId,
    eligibilityId: award.eligibilityId, awardedAt: award.awardedAt, reason: award.reason };
}

/**
 * 纯颁发准备，不自行授权或保存。可信宿主先校验资格，再在账户事务内读取已有记录、调用并原子插入。
 * 同账户同 medalId 只拥有一枚；不同纪念活动使用不同稳定 ID。原始来源和定义版本不会被后来应用覆盖。
 */
export function prepareMedalAward(definition: MedalDefinition, request: MedalAwardRequest,
  existing: MedalAward[]): MedalAwardResult {
  validateMedalDefinition(definition);
  validateRequest(request);
  if (definition.status !== 'approved') { throw new Error('Medal definition awaiting review'); }
  const found: MedalAward[] = existing.filter((award: MedalAward): boolean =>
    award.accountId === request.accountId && award.medalId === definition.id);
  if (found.length > 1) { throw new Error('Duplicate stored medal ownership'); }
  if (found.length === 1) {
    const award: MedalAward = found[0];
    validateMedalAward(award);
    if (award.productId === request.productId && award.eventId === request.eventId &&
      (award.issuerId !== request.issuerId || award.eligibilityId !== request.eligibilityId ||
        award.awardedAt !== request.awardedAt || award.reason !== request.reason)) {
      throw new Error('Conflicting medal award retry');
    }
    return { award: copyAward(award), changed: false };
  }
  const award: MedalAward = { accountId: request.accountId, medalId: definition.id,
    definitionVersion: definition.version, category: definition.category, productId: request.productId,
    eventId: request.eventId, issuerId: request.issuerId, eligibilityId: request.eligibilityId,
    awardedAt: request.awardedAt, reason: request.reason };
  return { award: award, changed: true };
}
