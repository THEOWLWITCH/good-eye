/*
 * DA — Undo / Redo / Reset history (spec §3, §13).
 * Holds immutable snapshots of an instrument's state (for the grid: the list of drag ops).
 * Reset is itself an undoable step.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});

  function History(initial) {
    this.present = clone(initial || []);
    this.past = [];
    this.future = [];
  }

  History.prototype.commit = function (next) {
    this.past.push(this.present);
    this.present = clone(next);
    this.future = [];
  };
  History.prototype.canUndo = function () { return this.past.length > 0; };
  History.prototype.canRedo = function () { return this.future.length > 0; };
  History.prototype.undo = function () {
    if (!this.canUndo()) return false;
    this.future.push(this.present);
    this.present = this.past.pop();
    return true;
  };
  History.prototype.redo = function () {
    if (!this.canRedo()) return false;
    this.past.push(this.present);
    this.present = this.future.pop();
    return true;
  };
  History.prototype.reset = function (empty) {
    if (JSON.stringify(this.present) === JSON.stringify(empty || [])) return false;
    this.commit(empty || []);
    return true;
  };
  History.prototype.load = function (state) {
    this.present = clone(state);
    this.past = [];
    this.future = [];
  };
  History.prototype.get = function () { return clone(this.present); };
  History.prototype.toJSON = function () {
    return { present: this.present, past: this.past, future: this.future };
  };
  History.fromJSON = function (o) {
    var h = new History(o.present);
    h.past = o.past || [];
    h.future = o.future || [];
    return h;
  };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  DA.History = History;
})(typeof window !== 'undefined' ? window : globalThis);
