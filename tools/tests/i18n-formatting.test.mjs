// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_LOCALES, resolveAppLocale, announcementLocale, appLocaleValues } from '../../entry/src/main/ets/model/AppLocales.ts';
import { localeDate, localeNumber, localePercent, localeMonthDay, localeCompact } from '../../entry/src/main/ets/utils/LocaleFormatting.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';

test('locale normalization preserves selected regions and migrates legacy English without collapsing Traditional Chinese',()=>{
  for(const [input,expected] of [['en','en-US'],['en_GB','en-GB'],['en-US','en-US'],['zh-Hant-HK','zh-HK'],
    ['zh_Hant_TW','zh-TW'],['zh-MO','zh-HK'],['zh-Hant','zh-TW'],['zh-CN','zh-Hans'],['it','it-IT'],
    ['ja','ja-JP'],['vi','vi-VN'],['ko','ko-KR'],['ru','ru-RU'],['de','de-DE'],['fr','fr-FR'],['unknown','zh-Hans']]){
    assert.equal(resolveAppLocale(input),expected,input);
  }
  assert.deepEqual(appLocaleValues(),APP_LOCALES.map(item=>item.locale).concat('en'));
  assert.equal(announcementLocale('ja-JP'),'en');assert.equal(announcementLocale('zh-HK'),'zh-Hans');
});

test('display numbers, percentages and dates follow the selected region',()=>{
  assert.equal(localeNumber(12345.6,'en-GB',1),'12,345.6');
  assert.equal(localeNumber(12345.6,'de-DE',1),'12.345,6');
  assert.equal(localeNumber(12345.6,'it-IT',1),'12.345,6');
  assert.equal(localeNumber(12345.6,'vi-VN',1),'12.345,6');
  assert.match(localeNumber(12345.6,'fr-FR',1),/^12[\u202f\u00a0 ]345,6$/);
  assert.match(localePercent(0.876,'de-DE',1),/^87,6[\u202f\u00a0 ]%$/);
  const date=new Date(2026,9,19,12).getTime();
  assert.equal(localeDate(date,'en-GB',false),'19/10/2026');
  assert.equal(localeDate(date,'en-US',false),'10/19/2026');
  assert.equal(localeDate(date,'de-DE',false),'19.10.2026');
  assert.equal(localeDate(0,'it-IT'),'—');assert.equal(localeDate(NaN,'ja-JP'),'—');
  assert.notEqual(localeMonthDay(new Date(date),'en-GB'),localeMonthDay(new Date(date),'en-US'));
  for(const item of APP_LOCALES){
    assert.ok(localeCompact(123456,item.locale).length>0);
    assert.ok(localeDate(date,item.locale).length>0);
  }
});

test('each locale reminder template replaces supported variables and keeps user text intact',()=>{
  for(const locale of APP_LOCALES){
    const rows=JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale.resourceDirectory}/element/string.json`,import.meta.url),'utf8')).string;
    const text=new Map(rows.map(item=>[item.name,item.value]));
    const reminder=loadPlatformModule('utils/StudyReminderText.ets','{reminderContent,reminderTitle}',{
      AppStorage:{get:()=>({resourceManager:{getStringByNameSync:key=>text.get(key)}})}
    });
    const value=reminder.reminderContent('',localeNumber(12345,locale.locale),'42');
    assert.doesNotMatch(value,/\{\{/u,locale.locale+' has an unsupported reminder variable');
    assert.ok(value.includes('42'),locale.locale);assert.ok(value.includes(localeNumber(12345,locale.locale)),locale.locale);
    assert.equal(reminder.reminderTitle('My own title'),'My own title');
    assert.equal(reminder.reminderContent('Custom {{new}} / {{review}}','5','6'),'Custom 5 / 6');
  }
});
