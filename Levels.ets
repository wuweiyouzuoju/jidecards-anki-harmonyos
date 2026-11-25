// SPDX-License-Identifier: AGPL-3.0-or-later
// 等级能力的独立源码入口；不自动加入当前 UI HAR 或改变已有产品。
export { LevelBand, LevelScale, UniformLevelScale, LevelMilestone, LevelMilestoneSource, DoublingLevelMilestones,
  LevelRules, LevelWarning,
  LevelNotice, LevelState, LevelActivity, LevelRisk, LevelAction, LevelRiskAssessment, LevelMutation, LevelCommit,
  SharedLevelStore, LevelSummary, LevelAchievementView, LevelViewData, SharedLevelAccount,
  createLevelState, cloneLevelState, validateLevelState, summarizeLevel } from './src/core/Levels';
export { SharedLevelBadge, SharedLevelCard, SharedLevelDetails, SharedLevelFeedback } from './src/harmony/Levels';
export { MedalArtwork, MedalDefinition, MedalAwardRequest, MedalAward, MedalAwardResult,
  medalColorLabel, medalInk, medalNumeral, medalSvg, levelMedalSvg, levelMedalDefinition, validateMedalDefinition,
  validateMedalAward, prepareMedalAward, resolveWornMedalId } from './src/core/Medals';
export { SharedMedalTile, SharedMedalItem, SharedMedalStrip, SharedMedalDetails } from './src/harmony/Medals';
export { SharedMedalIcon } from './src/harmony/MedalIcon';
