// SPDX-License-Identifier: AGPL-3.0-or-later
/** Core hint 过滤器生成 a.hint；点击原链接保留模板自带的显示行为。 */
export function studyHintScript(all: boolean): string {
  return '(function(){var hints=document.querySelectorAll("a.hint");for(var i=0;i<hints.length;i++){' +
    'if(hints[i].style.display!=="none"){hints[i].click();' + (all ? '' : 'break;') + '}}})()';
}
