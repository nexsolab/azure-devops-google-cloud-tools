/* globals describe, it */
/* eslint-disable no-console */
import path from 'path';
import assert from 'assert';
import * as ttm from 'azure-pipelines-task-lib/mock-test';

describe('Google Cloud Memorystore', function suite() {
  let created = false;
  this.timeout(60 * 1000);

  it('Create a new instance', (done) => {
    this.timeout(80 * 1000);

    const tp = path.join(__dirname, 'tests', 'create.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout);
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');
    created = tr.succeeded;

    setTimeout(done, 40 * 1000);
  });

  it('Upgrade the instance', (done) => {
    this.timeout(30 * 1000);
    assert.equal(created, true, 'instance may be created first');

    const tp = path.join(__dirname, 'tests', 'upgrade.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout);
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');

    setTimeout(done, 30 * 1000);
  });

  it('Failover the instance', (done) => {
    this.timeout(30 * 1000);
    assert.equal(created, true, 'instance may be created first');

    const tp = path.join(__dirname, 'tests', 'failover.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout);
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');

    done();
  });

  it('Delete a instance', (done) => {
    this.timeout(30 * 1000);
    assert.equal(created, true, 'instance may be created first');

    const tp = path.join(__dirname, 'tests', 'delete.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout);
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');

    done();
  });
});
