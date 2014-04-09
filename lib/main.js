/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { Cc, Ci, Cr, Cu, components } = require("chrome");
const events = require("sdk/system/events");

Cu.import("resource://services-common/utils.js");
let makeURI = CommonUtils.makeURI;

// cache decisions returned by the external service to avoid brutalizing it
// and perf to boot
//
// this will automatically be cleared on restart because it's stored in the
// addon's memory. if we persist it, we need to periodically check it as hosts
// update.
let HOSTNAME_CACHE = {};

function HeartbeatCheckListener(origRequest) {
  this.origRequest = origRequest;
  this._wrapper = null;
  this._response = "";
}

HeartbeatCheckListener.prototype = {

  QueryInterface: function(iid) {
    if (iid.equals(Ci.nsIStreamListener) ||
        iid.equals(Ci.nsIRequestObserver) ||
          iid.equals(Ci.nsISupports))
      return this;
    throw Cr.NS_ERROR_NO_INTERFACE;
  },

  onStartRequest: function(request, context) {},

  onDataAvailable:
  function(request, context, inputStream, offset, count) {
    if (this._wrapper == null) {
      this._wrapper = Cc["@mozilla.org/scriptableinputstream;1"]
                      .createInstance(Ci.nsIScriptableInputStream);
      this._wrapper.init(inputStream);
    }
    // store the response as it becomes available
    this._response += this._wrapper.read(count);
  },

  onStopRequest:
    function(request, context, status) {
    // status == NS_OK?
    if (components.isSuccessCode(status)) {
      // check the result
      // TODO: this is dumb
      // response is JSON
      console.log("this._response: " + this._response);
      let responseObj = JSON.parse(this._response);
      console.log("got responseObj: " + responseObj);
      let passedCheck = (responseObj.code == 1);
      // add to cache
      console.log("caching decision (" + this.origRequest.URI.host + ", " + passedCheck + ")");
      HOSTNAME_CACHE[this.origRequest.URI.host] = passedCheck;
      if (passedCheck) {
        console.log("External service said all good, resuming original request");
        this.origRequest.resume();
      } else {
        console.log("External service did no return all good, cancelling original request");
        this.origRequest.cancel();
      }
    }
    else {
      // something went wrong... log error and resume original request to avoid
      // breaking the web TODO do better
      console.error("status != NS_OK, allowing original request due to error");
      // resume the original request
      this.origRequest.resume();
    }
  }
}

function onModifyRequest(event) {
  let channel;
  try {
    channel = event.subject.QueryInterface(Ci.nsIHttpChannel);
  } catch (e) {
    console.log("channel was not nsIHttpChannel in http-on-modify-request");
  }

  if (!channel) { return; }

  let uri = channel.URI;

  // Note: this is not good enough. We probably shouldn't check Safe Browsing
  // requests, etc.
  if (! uri.schemeIs("https")) {
    console.log("not https: " + uri.asciiSpec);
    return;
  }
  console.log("https: " + uri.asciiSpec);

  // first check the cache
  if (HOSTNAME_CACHE.hasOwnProperty(uri.host)) {
    if (HOSTNAME_CACHE[uri.host] == false) {
      console.log("Cancelling request to bad domain according to cached check result");
      channel.cancel();
    } else {
      console.log("Allowing request (skipping check) according to cached check result");
      return;
    }
  }

  /* Start by suspending the original request */
  try {
    channel.suspend();
    console.log("suspended " + uri.asciiSpec);
    // TODO: pulled from reading source on http://filippo.io/Heartbleed
    // Append the hostname at the end of the URL to check
    let checkServiceURI = "http://bleed-1161785939.us-east-1.elb.amazonaws.com/bleed/"
    let ioService = Cc["@mozilla.org/network/io-service;1"]
                   .getService(Ci.nsIIOService);
    let checkChannel = ioService.newChannelFromURI(makeURI(checkServiceURI + uri.host));
    // make request anonymous (no cookies, etc.) so it can't be abused for
    // CSRF, etc.
    checkChannel.loadFlags |= Ci.nsIChannel.LOAD_ANONYMOUS;
    checkChannel.loadGroup = channel.loadGroup;
    checkChannel.asyncOpen(new HeartbeatCheckListener(channel), null);
  } catch (e) {
    console.log("error suspending https channel: " + e);
  }
}

function main(options) {
  console.log("in main");
  events.on("http-on-modify-request", onModifyRequest, false);
}

exports.main = main;
