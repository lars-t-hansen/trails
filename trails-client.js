/* Copyright 2015 Lars T Hansen.
 * Licensed under the Mozilla Public License 2.0.  See LICENSE for more.
 */

var g_startTime;
var g_readings;
var g_watcher;
var g_startButton;
var g_stopButton;
var g_uploadButton;
var g_running;
var g_device;

function initialize() {
    g_startButton = document.getElementById("startButton");
    g_stopButton = document.getElementById("stopButton");
    g_uploadButton = document.getElementById("uploadButton");
    enable(g_startButton);
    disable(g_stopButton);
    (numRecords() > 0 ? enable : disable)(g_uploadButton);
    g_device = "slartibartfast"; // FIXME
    g_running = false;
}

function onStart() {
    g_startTime = Date.now();
    g_readings = [];
    g_watcher = navigator.geolocation.watchPosition(recordPosition);
    disable(g_startButton);
    enable(g_stopButton);
    g_running = true;
}

function encodeCoordinate(x) {
    return Math.round(x*1e7);
}

function recordPosition(position) {
    var lat = encodeCoordinate(position.coords.latitude);
    var lon = encodeCoordinate(position.coords.longitude);
    if (g_readings.length) {
	// Prune repeated observations, could result from effects we don't
	// care about, eg, higher precision, change in perceived accuracy.
	var last = g_readings[g_readings.length-1];
	if (lat == last[0] && lon == last[1])
	    return;
    }
    g_readings.push([lat, lon]);
    // TODO: visual indication of activity?
}

function onStop() {
    var endTime = Date.now();
    navigator.geolocation.clearWatch(g_watcher);
    g_running = false;
    g_watcher = -1;
    enable(g_startButton);
    disable(g_stopButton);
    var trail =
	{ id: makeUUID(),
	  version: 1,
	  device: g_device,
	  start: g_startTime,
	  end: endTime,
	  readings: g_readings };
    appendRecord(JSON.stringify(trail));
    g_readings = null;
    enable(g_uploadButton);
}

function onUpload() {
    disable(g_uploadButton);
    if (numRecords() == 0)
	return;
    var r = firstRecord();
    sendRecord(r,
	       function () {
		   deleteFirstRecord();
		   onUpload();
	       },
	       function () {
		   showMessage("Upload failed");
		   (numRecords() > 0 ? enable : disable)(g_uploadButton);
	       });
}

function sendRecord(r, onSuccess, onFailure) {
    // FIXME: XHR send to the server
    alert(r);
    onSuccess();
}

function makeUUID() {
    // Hack
    return Math.round(Math.random()*Date.now()).toString(16);
}

function enable(button) {
    button.disabled = false;
}

function disable(button) {
    button.disabled = true;
}

// Simple database abstraction, stores a sequence of strings.
//
// Not actually safe against multiple concurrent clients on the same system
// since firstKey and nextKey are not updated atomically.  A "lock" property
// with double-checked locking might be sufficient to effect that, and
// performance is not that important.

function g_db = null;

function numRecords() {
    initDatabase();
    return parseInt(g_db.getItem("nextKey")) - parseInt(g_db.getItem("firstKey"));
}

function appendRecord(datum) {
    initDatabase();
    var k = parseInt(g_db.getItem("nextKey"));
    g_db.setItem(String(k), datum);
    g_db.setItem("nextKey", String(k+1));
}

function firstRecord() {
    return g_db.getItem(g_db.getItem("firstKey"));
}

function deleteFirstRecord() {
    var k = g_db.getItem("firstKey");
    g_db.removeItem(k);
    g_db.setItem("firstKey", String(parseInt(k)+1));
}

function initDatabase() {
    if (g_db)
	return;
    g_db = sessionStorage;	// localStorage, really
    var probe = g_db.getItem("nextKey");
    if (!probe) {
	g_db.setItem("firstKey", "0");
	g_db.setItem("nextKey", "0");
    }
}
