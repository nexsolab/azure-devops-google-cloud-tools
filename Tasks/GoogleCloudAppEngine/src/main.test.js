/* globals describe, it */
/* eslint-disable no-console */
import path from 'path';
import assert from 'assert';
import * as ttm from 'azure-pipelines-task-lib/mock-test';

describe('Google Cloud App Engine', function suite() {
  let created = false;
  this.timeout(30 * 60 * 1000);

  it('Create a new app', (done) => {
    this.timeout(80 * 1000);

    const tp = path.join(__dirname, 'tests', 'create.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout.replace(/%0A\s{2}/g, ''));
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');
    created = tr.succeeded;

    done();
  });

  it('Update the app', (done) => {
    this.timeout(30 * 1000);
    assert.equal(created, true, 'app may be created first');

    const tp = path.join(__dirname, 'tests', 'update.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout.replace(/%0A\s{2}/g, ''));
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');

    done();
  });

  it('Repair the app', (done) => {
    this.timeout(30 * 1000);
    assert.equal(created, true, 'app may be created first');

    const tp = path.join(__dirname, 'tests', 'repair.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout.replace(/%0A\s{2}/g, ''));
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');

    done();
  });

  it('Create firewall rule', (done) => {
    this.timeout(30 * 1000);
    assert.equal(created, true, 'app may be created first');

    const tp = path.join(__dirname, 'tests', 'firewall.js');
    const tj = path.join(__dirname, 'task.json');
    const tr = new ttm.MockTestRunner(tp, tj);
    tr.run();

    console.log(tr.stdout.replace(/%0A\s{2}/g, ''));
    if (!tr.succeeded) console.log(tr.stderr);
    assert.equal(tr.succeeded, true, 'should have succeeded');
    assert.equal(tr.errorIssues.length, 0, 'should have no errors');

    done();
  });
});
