// SPDX-License-Identifier: AGPL-3.0-or-later
import { AppInterfaceTracker } from '../model/AppInterface';

/** 单进程界面观察入口；UI 发布语义状态，Agent 仅读取。 */
export const appInterface: AppInterfaceTracker = new AppInterfaceTracker();
