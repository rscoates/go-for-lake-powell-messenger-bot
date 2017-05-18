'use strict';
const baseDir = '/home/ec2-user';
const logger = require(`${baseDir}/my-logger`);

function ButtonsPlacement(urlPrefix, trip) {
  if(!urlPrefix) throw new Error(`ButtonsPlacement: required parameter urlPrefix is missing`);
  if(!trip) throw new Error(`ButtonsPlacement: required parameter trip (of type TripData) is missing`);
  this.urlPrefix = urlPrefix;
  this.tripName = trip.tripName;
  this.trip = trip;
  if(!this.tripName) throw new Error(`ButtonsPlacement: tripName undefined in passed trip ${JSON.stringify(trip)}`);
}

function url(prefix, suffix) {
  return `${prefix}/${suffix}`;
}

ButtonsPlacement.prototype.getPlacement = function() {
	const tripCalendar = {
  	type: "web_url",
  	url: url(this.urlPrefix, `${this.tripName}/calendar`),
  	title: "Trip calendar",
  	webview_height_ratio: "compact",
  	messenger_extensions: true,
	};
	const weather = {
		type:"web_url",
  	url: url(this.urlPrefix, `${this.trip.weatherUrlPath()}`),
		title: "Weather",
		webview_height_ratio: "compact",
		messenger_extensions: true,
	}; 
  const bpButton = {
	  type: "postback",
	  title: "Boarding pass",
	  payload: "boarding_pass"
  };
  const itinButton = {
	  type: "postback",
	  title: "Itinerary",
	  payload: "itinerary"
  };
  const buttons = [];
  const fs = require('fs');
	if(fs.existsSync(this.trip.boardingPassFile())) buttons.push(bpButton);
	if(fs.existsSync(this.trip.itineraryFile())) buttons.push(itinButton);
  buttons.push(tripCalendar);
	buttons.push(weather);
  buttons.push({
    type:"web_url",
  	url: url(this.urlPrefix, `${this.trip.activitiesUrlPath()}`),
    title:"Activities",
    webview_height_ratio: "compact",
    messenger_extensions: true,
  }, {
    type: "web_url",
    url: url(this.urlPrefix, `${this.tripName}/comments`),
    title: "Comments",
    webview_height_ratio: "compact",
    messenger_extensions: true
  }, {
    type: "web_url",
    url: url(this.urlPrefix, `${this.tripName}/todo`),
    title: "Todo list",
    webview_height_ratio: "compact",
    messenger_extensions: true
  }, {
    type: "web_url",
    url: url(this.urlPrefix, `${this.tripName}/pack-list`),
    title: "Pack list",
    webview_height_ratio: "compact",
    messenger_extensions: true
  }, {
    type: "web_url",
  	url: url(this.urlPrefix, `${this.tripName}/expense-report`),
    title: "Expense report",
    webview_height_ratio: "compact",
    messenger_extensions: true
  },{
    type: "web_url",
  	url: url(this.urlPrefix, `${this.trip.flightQuoteUrlPath()}`),
    title:"Flight",
    webview_height_ratio: "compact",
    messenger_extensions: true
  });
  const result = {
    firstSet: [],
    secondSet: [],
    thirdSet: []
  };
  let list = result.firstSet;
  for(let i = 0; i < buttons.length; i++) {
    list.push(buttons[i]);
    if(i === 2) list = result.secondSet;
    if(i === 5) list = result.thirdSet;
    if(i === 8) break; // we only allow the top 9 buttons for now.
  }
  return result;
}

module.exports = ButtonsPlacement;