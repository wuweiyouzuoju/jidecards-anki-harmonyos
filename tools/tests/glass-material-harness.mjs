import { tintGlassFill } from '../../entry/src/main/ets/model/GlassTheme.ts';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { loadPlatformModule } from './platform-module-harness.mjs';
export function glassFillHarness(){
 return loadPlatformModule('utils/GlassMaterial.ets','translucentGlassFill',{AppStorage:{get:()=>undefined},tintGlassFill,ColorMetrics:{resourceColor(color){
  const value=typeof color==='string'&&/^#[0-9a-f]{6,8}$/i.test(color)?color.slice(1):'FFFFFF';
  const rgb=Number.parseInt(value.slice(-6),16),alpha=value.length===8?Number.parseInt(value.slice(0,2),16):255;
  return {red:(rgb>>>16)&255,green:(rgb>>>8)&255,blue:rgb&255,alpha};
 }}});
}
