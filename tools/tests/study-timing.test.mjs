// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { StudyTiming, StudyOptions, StudyAdvanceAction as Action } from '../../entry/src/main/ets/model/StudyTiming.ts';
import { StudySessionController } from '../../entry/src/main/ets/model/StudySessionController.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';

test('screen timer freezes at answer and caps its display without shortening recorded review time', async () => {
  const options = Object.assign(new StudyOptions(), { showTimer: true, stopTimerOnAnswer: true, capAnswerTimeToSecs: 60 });
  const timing = new StudyTiming();
  timing.showQuestion(1000);
  timing.showAnswer(6000);
  assert.equal(timing.displaySeconds(31000, options), 5);
  options.stopTimerOnAnswer = false;
  assert.equal(timing.displaySeconds(31000, options), 30);
  assert.equal(timing.displaySeconds(121000, options), 60);
  const submitted = [];
  const session = new StudySessionController({ answer: async value => submitted.push(value) }, new AutoSyncScheduler(), new SyncActivity());
  const state = new Uint8Array([1]);
  await session.answer({ cardId: 42, states: { current: state, again: state, hard: state, good: state, easy: state } }, 2, 31000, 1000);
  assert.equal(submitted[0].millisecondsTaken, 30000, 'Core receives full review duration and applies its own cap');
  session.dispose();
});

test('auto advance respects fractional deadlines and waits for all audio, issuing exactly one action', () => {
  const options = Object.assign(new StudyOptions(), { secondsToShowQuestion: 1.5 });
  const timing = new StudyTiming();
  timing.showQuestion(0);
  assert.equal(timing.takeAction(1499, options, false), Action.None);
  assert.equal(timing.takeAction(1500, options, true), Action.None);
  assert.equal(timing.takeAction(12000, options, true), Action.None);
  assert.equal(timing.takeAction(12001, options, false), Action.ShowAnswer);
  assert.equal(timing.takeAction(13000, options, false), Action.None);
  timing.showQuestion(20000);
  options.waitForAudio = false;
  assert.equal(timing.takeAction(21500, options, true), Action.ShowAnswer);
});

test('all answer actions map to existing scheduler choices and reminders do not grade', () => {
  const expected = [Action.Bury, Action.Again, Action.Good, Action.Hard, Action.Reminder];
  for (let answerAction = 0; answerAction < expected.length; answerAction++) {
    const options = Object.assign(new StudyOptions(), { secondsToShowAnswer: 2, answerAction });
    const timing = new StudyTiming();
    timing.showQuestion(0); timing.showAnswer(10000);
    assert.equal(timing.takeAction(11999, options, false), Action.None);
    assert.equal(timing.takeAction(12000, options, false), expected[answerAction]);
    assert.equal(timing.takeAction(15000, options, false), Action.None);
  }
  const timing = new StudyTiming(); timing.showQuestion(0);
  const options = Object.assign(new StudyOptions(), { secondsToShowQuestion: 1, questionAction: 1 });
  assert.equal(timing.takeAction(1000, options, false), Action.Reminder);
});

test('pauses exclude modal time and a manual restart resets only the advance deadline', () => {
  const timing = new StudyTiming();
  const options = Object.assign(new StudyOptions(), { secondsToShowQuestion: 5 });
  timing.showQuestion(0); timing.pause(2000);
  assert.equal(timing.displaySeconds(30000, options), 2);
  assert.equal(timing.takeAction(30000, options, false), Action.None);
  timing.resume(30000);
  assert.equal(timing.takeAction(32999, options, false), Action.None);
  timing.restartAdvance(33000);
  assert.equal(timing.displaySeconds(33000, options), 5);
  assert.equal(timing.takeAction(37999, options, false), Action.None);
  assert.equal(timing.takeAction(38000, options, false), Action.ShowAnswer);
  options.secondsToShowQuestion = 0;
  timing.showQuestion(40000);
  assert.equal(timing.takeAction(999999, options, false), Action.None);
});
