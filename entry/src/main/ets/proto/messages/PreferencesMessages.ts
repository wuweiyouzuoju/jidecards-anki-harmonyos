// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { 协议写入器 } from '../core/ProtoWriter';
import { CollectionCreateBackupRequest, ConfigPreferences, ConfigPreferencesBackupLimits, ConfigPreferencesReviewing, ConfigPreferencesScheduling } from '../generated/CoreMessages';
export function encodeCreateBackup(folder: string, force: boolean): Uint8Array {
    const writer = new CollectionCreateBackupRequest();
    if (folder !== '')
        writer.setBackupFolder(folder);
    if (force)
        writer.setForce(true);
    writer.setWaitForCompletion(true);
    return writer.转为字节();
}
export enum ReviewPreferenceField {
    Rollover,
    LearnAheadSecs,
    TimeLimitSecs,
    ShowRemaining,
    ShowIntervals,
    LoadBalancer,
    ShortTermWithSteps,
    BackupDaily,
    BackupWeekly,
    BackupMonthly,
    BackupInterval,
    HideAudioPlayButtons,
    InterruptAudioWhenAnswering
}
export interface ReviewPreferenceEdit {
    field: ReviewPreferenceField;
    value: number;
}
export class ReviewPreferences {
    rollover: number = 0;
    learnAheadSecs: number = 0;
    timeLimitSecs: number = 0;
    showRemaining: boolean = false;
    showIntervals: boolean = false;
    hideAudioPlayButtons: boolean = false;
    interruptAudioWhenAnswering: boolean = false;
    loadBalancer: boolean = false;
    shortTermWithSteps: boolean = false;
    backupDaily: number = 0;
    backupWeekly: number = 0;
    backupMonthly: number = 0;
    backupInterval: number = 0;
}
export function preferenceSection(field: ReviewPreferenceField): number {
    switch (field) {
        case ReviewPreferenceField.Rollover: return ConfigPreferences.FIELD_scheduling;
        case ReviewPreferenceField.LearnAheadSecs: return ConfigPreferences.FIELD_scheduling;
        case ReviewPreferenceField.TimeLimitSecs: return ConfigPreferences.FIELD_reviewing;
        case ReviewPreferenceField.ShowRemaining: return ConfigPreferences.FIELD_reviewing;
        case ReviewPreferenceField.ShowIntervals: return ConfigPreferences.FIELD_reviewing;
        case ReviewPreferenceField.LoadBalancer: return ConfigPreferences.FIELD_reviewing;
        case ReviewPreferenceField.ShortTermWithSteps: return ConfigPreferences.FIELD_reviewing;
        case ReviewPreferenceField.BackupDaily: return ConfigPreferences.FIELD_backups;
        case ReviewPreferenceField.BackupWeekly: return ConfigPreferences.FIELD_backups;
        case ReviewPreferenceField.BackupMonthly: return ConfigPreferences.FIELD_backups;
        case ReviewPreferenceField.BackupInterval: return ConfigPreferences.FIELD_backups;
        case ReviewPreferenceField.HideAudioPlayButtons: return ConfigPreferences.FIELD_reviewing;
        case ReviewPreferenceField.InterruptAudioWhenAnswering: return ConfigPreferences.FIELD_reviewing;
        default: throw new Error('invalid_review_preference');
    }
}
export function preferenceTag(field: ReviewPreferenceField): number {
    switch (field) {
        case ReviewPreferenceField.Rollover: return ConfigPreferencesScheduling.FIELD_rollover;
        case ReviewPreferenceField.LearnAheadSecs: return ConfigPreferencesScheduling.FIELD_learnAheadSecs;
        case ReviewPreferenceField.TimeLimitSecs: return ConfigPreferencesReviewing.FIELD_timeLimitSecs;
        case ReviewPreferenceField.ShowRemaining: return ConfigPreferencesReviewing.FIELD_showRemainingDueCounts;
        case ReviewPreferenceField.ShowIntervals: return ConfigPreferencesReviewing.FIELD_showIntervalsOnButtons;
        case ReviewPreferenceField.LoadBalancer: return ConfigPreferencesReviewing.FIELD_loadBalancerEnabled;
        case ReviewPreferenceField.ShortTermWithSteps: return ConfigPreferencesReviewing.FIELD_fsrsShortTermWithStepsEnabled;
        case ReviewPreferenceField.BackupDaily: return ConfigPreferencesBackupLimits.FIELD_daily;
        case ReviewPreferenceField.BackupWeekly: return ConfigPreferencesBackupLimits.FIELD_weekly;
        case ReviewPreferenceField.BackupMonthly: return ConfigPreferencesBackupLimits.FIELD_monthly;
        case ReviewPreferenceField.BackupInterval: return ConfigPreferencesBackupLimits.FIELD_minimumIntervalMins;
        case ReviewPreferenceField.HideAudioPlayButtons: return ConfigPreferencesReviewing.FIELD_hideAudioPlayButtons;
        case ReviewPreferenceField.InterruptAudioWhenAnswering: return ConfigPreferencesReviewing.FIELD_interruptAudioWhenAnswering;
        default: throw new Error('invalid_review_preference');
    }
}
export function validatePreferenceEdit(edit: ReviewPreferenceEdit): void {
    preferenceTag(edit.field);
    const max: number = edit.field === ReviewPreferenceField.Rollover ? 23 :
        ([ReviewPreferenceField.ShowRemaining, ReviewPreferenceField.ShowIntervals, ReviewPreferenceField.LoadBalancer,
            ReviewPreferenceField.ShortTermWithSteps, ReviewPreferenceField.HideAudioPlayButtons,
            ReviewPreferenceField.InterruptAudioWhenAnswering].includes(edit.field) ? 1 : 4294967295);
    if (!Number.isInteger(edit.value) || edit.value < 0 || edit.value > max) {
        throw new Error('invalid_review_preference_value');
    }
}
export function decodeReviewPreferences(bytes: Uint8Array): ReviewPreferences {
    const m = new ConfigPreferences(bytes);
    const out = new ReviewPreferences();
    for (const raw of m.rawScheduling()) {
        const v = new ConfigPreferencesScheduling(new ConfigPreferences(raw).getSchedulingLast()!);
        if (v.hasRollover())
            out.rollover = v.getRollover();
    }
    for (const raw of m.rawScheduling()) {
        const v = new ConfigPreferencesScheduling(new ConfigPreferences(raw).getSchedulingLast()!);
        if (v.hasLearnAheadSecs())
            out.learnAheadSecs = v.getLearnAheadSecs();
    }
    for (const raw of m.rawReviewing()) {
        const v = new ConfigPreferencesReviewing(new ConfigPreferences(raw).getReviewingLast()!);
        if (v.hasTimeLimitSecs())
            out.timeLimitSecs = v.getTimeLimitSecs();
    }
    for (const raw of m.rawReviewing()) {
        const v = new ConfigPreferencesReviewing(new ConfigPreferences(raw).getReviewingLast()!);
        if (v.hasShowRemainingDueCounts())
            out.showRemaining = v.getShowRemainingDueCounts();
    }
    for (const raw of m.rawReviewing()) {
        const v = new ConfigPreferencesReviewing(new ConfigPreferences(raw).getReviewingLast()!);
        if (v.hasShowIntervalsOnButtons())
            out.showIntervals = v.getShowIntervalsOnButtons();
    }
    for (const raw of m.rawReviewing()) {
        const v = new ConfigPreferencesReviewing(new ConfigPreferences(raw).getReviewingLast()!);
        if (v.hasLoadBalancerEnabled())
            out.loadBalancer = v.getLoadBalancerEnabled();
    }
    for (const raw of m.rawReviewing()) {
        const v = new ConfigPreferencesReviewing(new ConfigPreferences(raw).getReviewingLast()!);
        if (v.hasFsrsShortTermWithStepsEnabled())
            out.shortTermWithSteps = v.getFsrsShortTermWithStepsEnabled();
    }
    for (const raw of m.rawBackups()) {
        const v = new ConfigPreferencesBackupLimits(new ConfigPreferences(raw).getBackupsLast()!);
        if (v.hasDaily())
            out.backupDaily = v.getDaily();
    }
    for (const raw of m.rawBackups()) {
        const v = new ConfigPreferencesBackupLimits(new ConfigPreferences(raw).getBackupsLast()!);
        if (v.hasWeekly())
            out.backupWeekly = v.getWeekly();
    }
    for (const raw of m.rawBackups()) {
        const v = new ConfigPreferencesBackupLimits(new ConfigPreferences(raw).getBackupsLast()!);
        if (v.hasMonthly())
            out.backupMonthly = v.getMonthly();
    }
    for (const raw of m.rawBackups()) {
        const v = new ConfigPreferencesBackupLimits(new ConfigPreferences(raw).getBackupsLast()!);
        if (v.hasMinimumIntervalMins())
            out.backupInterval = v.getMinimumIntervalMins();
    }
    for (const raw of m.rawReviewing()) {
        const v = new ConfigPreferencesReviewing(new ConfigPreferences(raw).getReviewingLast()!);
        if (v.hasHideAudioPlayButtons())
            out.hideAudioPlayButtons = v.getHideAudioPlayButtons();
    }
    for (const raw of m.rawReviewing()) {
        const v = new ConfigPreferencesReviewing(new ConfigPreferences(raw).getReviewingLast()!);
        if (v.hasInterruptAudioWhenAnswering())
            out.interruptAudioWhenAnswering = v.getInterruptAudioWhenAnswering();
    }
    return out;
}
export function patchReviewPreferences(bytes: Uint8Array, edits: ReviewPreferenceEdit[]): Uint8Array {
    for (const edit of edits)
        validatePreferenceEdit(edit);
    const m = new ConfigPreferences(bytes);
    const w = new ConfigPreferences();
    for (const raw of m.unknown(edits.map((edit: ReviewPreferenceEdit): number => preferenceSection(edit.field))))
        w.appendRaw(raw);
    for (const section of [ConfigPreferences.FIELD_scheduling, ConfigPreferences.FIELD_reviewing, ConfigPreferences.FIELD_backups]) {
        const changes = edits.filter((edit: ReviewPreferenceEdit): boolean => preferenceSection(edit.field) === section);
        if (changes.length === 0)
            continue;
        const raw = section === ConfigPreferences.FIELD_scheduling ? m.rawScheduling() : section === ConfigPreferences.FIELD_reviewing ? m.rawReviewing() : m.rawBackups();
        if (raw.length === 0)
            throw new Error('missing_preferences_section');
        const merged = new 协议写入器();
        for (const bytes of raw) {
            const part = new ConfigPreferences(bytes);
            merged.写入原始字节((section === ConfigPreferences.FIELD_scheduling ? part.getSchedulingLast() : section === ConfigPreferences.FIELD_reviewing ? part.getReviewingLast() : part.getBackupsLast())!);
        }
        const tags = changes.map((edit: ReviewPreferenceEdit): number => preferenceTag(edit.field));
        if (section === ConfigPreferences.FIELD_scheduling) {
            const v = new ConfigPreferencesScheduling(merged.转为字节());
            const updated = new ConfigPreferencesScheduling();
            for (const bytes of v.unknown(tags))
                updated.appendRaw(bytes);
            for (const edit of changes) {
                if (edit.field === ReviewPreferenceField.Rollover)
                    updated.setRollover(edit.value);
                else
                    updated.setLearnAheadSecs(edit.value);
            }
            w.setScheduling(updated.toBytes());
        }
        else if (section === ConfigPreferences.FIELD_backups) {
            const v = new ConfigPreferencesBackupLimits(merged.转为字节());
            const updated = new ConfigPreferencesBackupLimits();
            for (const bytes of v.unknown(tags))
                updated.appendRaw(bytes);
            for (const edit of changes) {
                switch (edit.field) {
                    case ReviewPreferenceField.BackupDaily:
                        updated.setDaily(edit.value);
                        break;
                    case ReviewPreferenceField.BackupWeekly:
                        updated.setWeekly(edit.value);
                        break;
                    case ReviewPreferenceField.BackupMonthly:
                        updated.setMonthly(edit.value);
                        break;
                    case ReviewPreferenceField.BackupInterval:
                        updated.setMinimumIntervalMins(edit.value);
                        break;
                }
            }
            w.setBackups(updated.toBytes());
        }
        else {
            const v = new ConfigPreferencesReviewing(merged.转为字节());
            const updated = new ConfigPreferencesReviewing();
            for (const bytes of v.unknown(tags))
                updated.appendRaw(bytes);
            for (const edit of changes) {
                switch (edit.field) {
                    case ReviewPreferenceField.TimeLimitSecs:
                        updated.setTimeLimitSecs(edit.value);
                        break;
                    case ReviewPreferenceField.ShowRemaining:
                        updated.setShowRemainingDueCounts(edit.value !== 0);
                        break;
                    case ReviewPreferenceField.ShowIntervals:
                        updated.setShowIntervalsOnButtons(edit.value !== 0);
                        break;
                    case ReviewPreferenceField.LoadBalancer:
                        updated.setLoadBalancerEnabled(edit.value !== 0);
                        break;
                    case ReviewPreferenceField.ShortTermWithSteps:
                        updated.setFsrsShortTermWithStepsEnabled(edit.value !== 0);
                        break;
                    case ReviewPreferenceField.HideAudioPlayButtons:
                        updated.setHideAudioPlayButtons(edit.value !== 0);
                        break;
                    case ReviewPreferenceField.InterruptAudioWhenAnswering:
                        updated.setInterruptAudioWhenAnswering(edit.value !== 0);
                        break;
                }
            }
            w.setReviewing(updated.toBytes());
        }
    }
    return w.toBytes();
}
