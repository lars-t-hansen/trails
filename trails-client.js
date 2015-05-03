/* Copyright 2015 Lars T Hansen.
 * Licensed under the Mozilla Public License 2.0.  See LICENSE for more.
 */

var g_startTime;
var g_readings;
var g_distance;
var g_watcher;
var g_running;
var g_server;

function initialize() {
    initDisplay();
    g_running = false;
}

function onStart() {
    g_server = window.location.origin;
    g_startTime = Date.now();
    g_readings = [];
    g_distance = 0;
    g_watcher = navigator.geolocation.watchPosition(recordPosition,
						    () => true,
						    { enableHighAccuracy: true });
    clearDisplay();
    setButtons("running");
    g_running = true;
}

function onStop() {
    var endTime = Date.now();
    navigator.geolocation.clearWatch(g_watcher);
    g_running = false;
    g_watcher = -1;
    var trail =
	{ uuid: makeUUID(),
	  version: 1,
	  device: deviceName(),
	  start: g_startTime,
	  end: endTime,
	  distance: g_distance,
	  readings: g_readings };
    appendRecord(JSON.stringify(trail));
    g_readings = null;
    setButtons("idle");
}

function onUpload() {
    disableUpload();
    onUpload2();
}

function onUpload2() {
    if (numRecords() == 0)
	return;
    var r = firstRecord();
    sendRecord(r,
	       function () {
		   deleteFirstRecord();
		   onUpload2();
	       },
	       function () {
		   // FIXME: this is crude.  Why did it fail?  Did it fail for this record
		   // or in general?
		   showMessage("Upload failed.");
		   enableUpload();
	       });
}

function recordPosition(position) {
    var lat = position.coords.latitude;
    var lon = position.coords.longitude;
    if (g_readings.length) {
	// Prune repeated observations, could result from effects we don't
	// care about, eg, higher precision, change in perceived accuracy.
	var last = g_readings[g_readings.length-1];
	if (lat == last[0] && lon == last[1])
	    return;

	// Estimate distance.  Point-by-point is not the best we can do;
	// if several observations are more or less on a line then we can
	// also do the endpoints.
	g_distance += distanceBetween(last[0], last[1], lat, lon);
    }
    g_readings.push([lat, lon]);
    updateDisplay();
}

// http://en.wikipedia.org/wiki/Great-circle_distance
// http://en.wikipedia.org/wiki/Earth_radius

const earth_avg_radius = 6371009.0;	// meters

function distanceBetween(lat_a, lon_a, lat_b, lon_b) {
    // Convert to radians
    lat_a = (lat_a / 180) * Math.PI;
    lon_a = (lon_a / 180) * Math.PI;
    lat_b = (lat_b / 180) * Math.PI;
    lon_b = (lon_b / 180) * Math.PI;
    //var delta_lat = Math.abs(lat_a - lat_b);
    var delta_lon = Math.abs(lon_a - lon_b);
    // TODO:
    // This formula may be subject to a little accuracy loss, see first reference
    // above for adjustments that can be made.  But with doubles we're more or less OK.
    var central_angle = Math.acos(Math.sin(lat_a) * Math.sin(lat_b) + Math.cos(lat_a) * Math.cos(lat_b) * Math.cos(delta_lon));
    // TODO:
    // We can probably use a "radius" that is better adapted to the latitude.  But
    // for the rough distance computed by this application, an average is just fine.
    return earth_avg_radius * central_angle;
}

function sendRecord(r, onSuccess, onFailure) {
    var req = new XMLHttpRequest();
    req.onload = function (ev) { onSuccess(); }; // TODO: response codes!
    req.onerror = function (ev) { onFailure() };
    req.onabort = function (ev) { onFailure() };
    req.open("post", g_server + "/trail/" + userName() + "/" + encodeURIComponent(password()));
    req.overrideMimeType("application/json");
    req.send(r);
}

function makeUUID() {
    // Hack
    return Math.round(Math.random()*Date.now()).toString(16);
}

//////////////////////////////////////////////////////////////////////
//
// Display code.

var g_display;

function initDisplay() {
    g_display = {
	startButton: document.getElementById("startButton"),
	stopButton: document.getElementById("stopButton"),
	uploadButton: document.getElementById("uploadButton"),
	observations: document.getElementById("observations"),
	elapsed: document.getElementById("elapsed"),
	distance: document.getElementById("distance")
    };
    setButtons("idle");
}

function setButtons(state) {
    switch (state) {
    case "idle":
	enable(g_display.startButton);
	disable(g_display.stopButton);
	break;
    case "running":
	disable(g_display.startButton);
	enable(g_display.stopButton);
    }
    enableUpload();
}

function disableUpload() {
    disable(g_display.uploadButton);
}

function enableUpload() {
    (numRecords() > 0 ? enable : disable)(g_display.uploadButton);
}

function clearDisplay() {
    g_display.observations.innerHTML = "";
    g_display.elapsed.innerHTML = "";
    g_display.distance.innerHTML = "";
}

function updateDisplay() {
    g_display.observations.innerHTML = g_readings.length;
    g_display.elapsed.innerHTML = elapsedTimeSince(g_startTime);
    if (g_distance > 0) {
	if (g_distance < 1000)
	    g_display.distance.innerHTML = Math.round(g_distance) + "m";
	else
	    g_display.distance.innerHTML = (Math.round(g_distance / 10)/100) + "km";
    }
}

function enable(button) {
    button.disabled = false;
}

function disable(button) {
    button.disabled = true;
}

function elapsedTimeSince(t) {
    function pad(x) {
	return (x+100).toString().substring(1);
    }

    var delta = Math.round((Date.now() - t)/1000);
    var s = delta % 60;
    delta = (delta - s) / 60;
    var m = delta % 60;
    delta = (delta - m) / 60;
    var h = delta % 24;
    delta = (delta - h) / 24;
    var d = delta;
    var x = pad(m) + ":" + pad(s);
    if (h > 0) {
	if (d > 0)
	    x = pad(h) + ":" + x;
	else
	    x = h + ":" + x;
    }
    if (d > 0)
	x = d + ":" + x;
    return x;
}

//////////////////////////////////////////////////////////////////////
//
// Preferences.

var g_device;
var g_userid;
var g_passwd;

function deviceName() {
    if (!g_device)
	g_device = "slartibartfast"; // FIXME
    return g_device;
}

function userId() {
    if (!g_userid)
	g_userid = "lth";	// FIXME
    return g_userid;
}

function password() {
    if (!g_passwd)
	g_passwd = "qumquat";	// FIXME
    return g_passwd;
}

//////////////////////////////////////////////////////////////////////
//
// Persistent store of pending upload records.
//
// Not actually safe against multiple concurrent clients on the same system
// since firstKey and nextKey are not updated atomically.  A "lock" property
// with double-checked locking might be sufficient to effect that, and
// performance is not that important.

var g_db = null;

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
    g_db = localStorage;
    var probe = g_db.getItem("nextKey");
    if (!probe) {
	g_db.setItem("firstKey", "0");
	g_db.setItem("nextKey", "0");
    }
}
