/* globals describe, it */
/* eslint-disable no-console */
import path from 'path';
import assert from 'assert';
import * as ttm from 'azure-pipelines-task-lib/mock-test';

/**
 * Auto-detect the best mechanism based in the criterias.
 *
 * @author Gabriel Anderson
 * @param {boolean} largeVolume Large volume of messages
 * @param {boolean} criticalThroughput Efficiency and throughput of message processing is critical
 * @param {boolean} processMultipleTopics Multiple topics that must be processed by the same webhook
 * @param {boolean} serverless App Engine Standard and Cloud Functions subscribers
 * @param {('pull'|'push')} publicAccess Whether the resource can be accessed publicly (push)
 * @param {('pull'|'push')} flowControl Flow control
 * @returns {('pull'|'push')} Detected mechanism: `pull` or `push`
 */
function detectMechanism(
  largeVolume, criticalThroughput, processMultipleTopics, serverless, publicAccess, flowControl,
) {
  const pull = [largeVolume, criticalThroughput, flowControl === 'pull'].filter((p) => p);
  const push = [processMultipleTopics, serverless, flowControl === 'push'].filter((p) => p);
  if (publicAccess === 'pull') return 'pull';
  const result = push.length > pull.length ? 'push' : 'pull';
  return result;
}

describe('Google Cloud PubSub', function suite() {
  let topicCreated = false;
  let subscriptionCreated = false;
  this.timeout(5 * 60 * 1000);

  it('Cloud PubSub - Create/Update topic test', (done) => {
    this.timeout(60 * 1000);

    const tp = path.join(__dirname, 'tests', 'create-topic.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout);
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');
    topicCreated = tr.succeeded;

    setTimeout(done, 40 * 1000);
  });

  it('Cloud PubSub - Subscribe to topic test subtest', (done) => {
    this.timeout(30 * 1000);
    assert.equal(topicCreated, true, 'topic may be created first');

    const tp = path.join(__dirname, 'tests', 'subscribe.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout);
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');
    subscriptionCreated = tr.succeeded;

    setTimeout(done, 20 * 1000);
  });

  it('Cloud PubSub - Pause push subscription  subtest', (done) => {
    this.timeout(30 * 1000);
    assert.equal(subscriptionCreated, true, 'subscription may be created first');

    const tp = path.join(__dirname, 'tests', 'pause-subscription.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout);
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');

    done();
  });

  it('Cloud PubSub - Publish message to test', (done) => {
    this.timeout(30 * 1000);
    assert.equal(topicCreated, true, 'topic may be created first');

    const tp = path.join(__dirname, 'tests', 'publish-message.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout);
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');

    setTimeout(done, 5 * 1000);
  });

  it('Cloud PubSub - Get messages from subscription  subtest', (done) => {
    this.timeout(30 * 1000);
    assert.equal(subscriptionCreated, true, 'subscription may be created first');

    const tp = path.join(__dirname, 'tests', 'get-messages.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout);
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');

    done();
  });

  it('Cloud PubSub - Delete subscription  subtest', (done) => {
    this.timeout(30 * 1000);
    assert.equal(subscriptionCreated, true, 'subscription may be created first');

    const tp = path.join(__dirname, 'tests', 'delete-subscription.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout);
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');

    done();
  });

  it('Cloud PubSub - Delete topic test', (done) => {
    this.timeout(30 * 1000);
    assert.equal(topicCreated && subscriptionCreated, true, 'topic and subscription may be created first');

    const tp = path.join(__dirname, 'tests', 'delete-topic.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout);
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');

    done();
  });

  it('--Test auto mechanism detection', (done) => {
    const pull = detectMechanism(true, true, false, false, 'push', 'pull');
    const push = detectMechanism(false, false, true, true, 'push', 'push');
    const noPublicAccess = detectMechanism(false, false, true, true, 'pull', 'push');
    assert.equal(pull, 'pull', 'Large volume of messages and critical throughput should be "pull".');
    assert.equal(push, 'push', 'Multiple topics and serverless apps should be "push".');
    assert.equal(noPublicAccess, 'pull', 'Resources without public access should use "pull" mechanism.');
    done();
  });
});
