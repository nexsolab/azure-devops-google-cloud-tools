/* globals describe, it */
/* eslint-disable no-console */
import path from 'path';
import assert from 'assert';
import * as ttm from 'azure-pipelines-task-lib/mock-test';

describe('Google Cloud DNS', function suite() {
  let created = false;
  this.timeout(10 * 60 * 1000);

  it('Set a new record', (done) => {
    this.timeout(5 * 60 * 1000);

    const tp = path.join(__dirname, 'tests', 'add-record.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout);
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');
    created = tr.succeeded;

    setTimeout(done, 2 * 60 * 1000);
  });

  it('Get the record value', (done) => {
    this.timeout(15 * 1000);
    assert.equal(created, true, 'record may be set first');

    const tp = path.join(__dirname, 'tests', 'get-record.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout);
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');
    done();
  });

  it('Delete the record', (done) => {
    this.timeout(30 * 1000);
    assert.equal(created, true, 'record may be set first');

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
