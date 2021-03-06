/* globals describe, it */
/* eslint-disable no-console */
import path from 'path';
import assert from 'assert';
import * as ttm from 'azure-pipelines-task-lib/mock-test';

describe('Google Cloud Functions', function suite() {
  let created = false;
  this.timeout(60 * 1000);

  it('Create a new function', (done) => {
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

  it('Get and update function props', (done) => {
    this.timeout(30 * 1000);
    assert.equal(created, true, 'function may be created first');

    const tp = path.join(__dirname, 'tests', 'update.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout);
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');

    setTimeout(done, 30 * 1000);
  });

  it('Call function and get the result', (done) => {
    this.timeout(30 * 1000);
    assert.equal(created, true, 'function may be created first');

    const tp = path.join(__dirname, 'tests', 'call.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout);
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');

    done();
  });

  it('Delete the function', (done) => {
    this.timeout(30 * 1000);
    assert.equal(created, true, 'function may be created first');

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
