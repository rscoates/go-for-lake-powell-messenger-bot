'use strict';

const fs = require('fs');
const CreateItinerary = require('trip-itinerary/app/create-itin'); 
const baseDir = "/home/ec2-user";
const logger = require(`${baseDir}/my-logger`);
const moment = require('moment');
const NextActivityGetter = require('calendar-view/app/next-activity-getter');

function DayPlanner(date, trip, fbid) {
  if(!fbid) throw new Error(`DayPlanner: required parameter fbid not passed`);
  if(!trip) throw new Error(`DayPlanner: required parameter trip not passed`);
  if(!date) throw new Error(`DayPlanner: required parameter date not passed`);
  this.date = date;
  this.trip = trip;
  this.fbid = fbid;
}

DayPlanner.prototype.getPlan = function(dayItinerary) {
  const date = this.date;
  const dateStr = CreateItinerary.formatDate(date);
  const dayPlan = dayItinerary;
  logger.debug(`getDayItinerary: getting plans for date ${dateStr}`);
  let city = "";
  if(!dayPlan) {
    logger.info(`getPlan: Itinerary does not contain any information for date ${dateStr}`);
    logger.debug(`getPlan: dump of trip ${this.trip.tripName}; ${JSON.stringify(this.trip)}`);
    return {
      city: this.trip.data.rawName,
      dayPlan: `<li>No details available for date ${dateStr}</li>`
    }
  }
  if(Array.isArray(dayPlan.city)) {
    dayPlan.city.forEach((c,index) => {
      city += capitalize1stChar(c);
      if(index != (dayPlan.city.length - 1)) city += "/";
    });
    this.departureCity = dayPlan.city[0];
    this.arrivalCity = dayPlan.city[dayPlan.city.length - 1];
  }
  else {
    city = capitalize1stChar(dayPlan.city);
    this.departureCity = city;
    this.arrivalCity = city;
  }
  // logger.debug(`getPlan: dayPlan city: ${dayPlan.city}`);
  if(!dayPlan) return `No itinerary exists for date ${dateStr} for trip ${this.trip.data.rawName}, which starts on ${this.trip.data.startDate} and ends on ${this.trip.data.returnDate}`;
  // logger.debug(`getPlan: dayPlan dump: ${JSON.stringify(dayPlan)}; city: ${city}`);
  let plans = [];
  plans = plans.concat(weatherDetails.call(this, dayPlan));
  const returnDateStr = CreateItinerary.formatDate(new Date(this.trip.data.returnDate));
  // add flightDetails here only if this is not return date
  // logger.debug(`getPlan: returnDateStr: ${returnDateStr}; date: ${dateStr}`);
  if(returnDateStr !== dateStr) plans = plans.concat(flightDetails.call(this, dayPlan));
  plans = plans.concat(visitDetails.call(this, dayPlan));
  if(dayPlan.userInputDetails) plans = plans.concat(dayPlan.userInputDetails);
  if(returnDateStr === dateStr) plans = plans.concat(flightDetails.call(this, dayPlan));
  return {
    city: city,
    dayPlan: list(plans)
  };
}

DayPlanner.prototype.getMealElement = function(meal) {
  const dateStr = CreateItinerary.formatDate(this.date);
  const dateMealMapping = {
    "6/17/2017": {
      breakfast: "0",
      lunch: "2",
      dinner: "6"
    },
    "6/18/2017": {
      breakfast: "0",
      dinner: "3"
    }
  };
  const idx = dateMealMapping[dateStr][meal];
  logger.debug(`getMealElement: meal ${meal} on date ${dateStr}. index is ${idx}`);
  if(!idx) {
    const date = new moment(this.date).format("Do");
    return {
      recipient: {
        id: this.fbid
      },
      message: {
        text: `Cannot find ${meal} details for the ${date}. See activities for that day by typing "${date}"`,
        metadata: "DEVELOPER_DEFINED_METADATA"
      }
    };
  }
  return activityAsListElement.call(this, parseInt(idx));
}

// Facebook supports sending only 4 items in an elementList. So, use payload (see below) to pass around the index for the next set of items. 
DayPlanner.prototype.getPlanAsList = function(setNum) {
  const file = this.trip.dayItineraryFile(this.date);
  logger.debug(`getPlanAsList: using list template to display itin for date ${this.date} and file ${file}`);
  try {
    const dayAsList = JSON.parse(fs.readFileSync(file, 'utf8'));
    const elementSet = [];
    Object.keys(dayAsList).forEach(key => {
      elementSet.push(dayAsList[key]);
    });
    let currIndex = 0;
    if(setNum) currIndex = setNum;
    const elements = elementSet[currIndex];
    const payload = `${this.date.getFullYear()}-${this.date.getMonth()}-${this.date.getDate()}-${currIndex + 1}-itin_second_set`;
    let message = {
      recipient: {
        id: this.fbid
      },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "list",
          }
        }
      }
    };
    const viewMoreButton = [{
      title: "View more",
      type: "postback",
      payload: payload
    }];
    const returnFlight = [{
      title: "Return Flight",
      "type": "postback",
      payload: "return flight"
    }];
    message.message.attachment.payload.elements = elements;
    if(currIndex < (elementSet.length - 1)) message.message.attachment.payload.buttons = viewMoreButton;
    // TODO: A better way to determine if we want to show the return flight is to see if this is the last activity for this trip.
    if(elements[elements.length-1].subtitle.startsWith("Flight ")) message.message.attachment.payload.buttons = returnFlight;
    // the first item in the list is always a map, so we don't set the style to compact. Subsequent items are just normal.
    if(currIndex > 0) message.message.attachment.payload.top_element_style = "compact";
    return message;
  }
  catch(e) {
    logger.error(`error in getting plans for date ${this.date}: ${e.stack}`);
    return null;
  }
}

DayPlanner.prototype.setActivityList = function() {
  if(this.activityList) return; // make this method idempotent
  try {
    const file = this.trip.dayItineraryFile(this.date);
    logger.debug(`setActivityList: getting activity from itin for date ${this.date} and file ${file}`);
    const dayItin = JSON.parse(fs.readFileSync(file, 'utf8'));
    this.activityList = [];
    Object.keys(dayItin).forEach(key => {
      if(!Array.isArray(dayItin[key])) throw new Error(`setActivityList: itin for date ${this.date} from file ${file} and key ${key} needs to be an array. But it's not. It's value is ${dayItin[key]}`);
      // only add actual activities to the list. for example, we tack on a "Itinerary as a map" item. Ignore that..
      if(dayItin[key][0].title.includes("itinerary as a map")) dayItin[key].splice(0, 1);
      this.activityList = this.activityList.concat(dayItin[key]);
    }, this);
  }
  catch(e) {
    logger.error(`error getting activities for date ${this.date}: ${e.stack}`);
  }
}

// TODO: Replace getPrevActivity & getNextActivity by activityAsListElement and remove these functions.
DayPlanner.prototype.getPrevActivity = function(idx) {
  const result = activityAsListElement.call(this, idx);
  return result;
}

DayPlanner.prototype.getNextActivity = function(idx) {
  const result = activityAsListElement.call(this, idx);
  return result;
}

DayPlanner.prototype.getNextActivityRelativeToTime = function() {
  const errMessage = {
      recipient: {
        id: this.fbid
      },
      message: {
        text: `unable to get "next" activity for today. We are actively looking into the issue. In the meanwhile, you can try "first" or "today" to get the itinerary details`,
        metadata: "DEVELOPER_DEFINED_METADATA"
      }
  };
  try {
    const date = this.date.getDate();
    logger.debug(`getNextActivityRelativeToTime: getting next activity for date ${date}`);
    const nag = new NextActivityGetter(date);
    const index = nag.getNext();
    if(index < 0 || index > this.activityList.length) {
      logger.error(`getNextActivityRelativeToTime: index ${index} out of bounds for date ${date}`);
      return errMessage;
    }
    return activityAsListElement.call(this, index);
  }
  catch(e) {
    logger.error(`getNextActivityRelativeToTime: error ${e.stack}`);
    return errMessage;
  }
}

function activityAsListElement(idx) {
  if(!this.activityList) throw new Error(`activityAsListElement: this.activityList is not defined. Maybe you forgot to call setActivityList before calling me?`);
  if(idx >= this.activityList.length) {
    return {
      recipient: {
        id: this.fbid
      },
      message: {
        text: `No more activities. Get previous activity with command "prev for ${this.date.getDate()}th". You can also type "first ..." to get first activity`,
        metadata: "DEVELOPER_DEFINED_METADATA"
      }
    };
  }
  if(idx < 0) {
    return {
      recipient: {
        id: this.fbid
      },
      message: {
        text: `Already at first activity. Get next activity with commmand "next for ${this.date.getDate()}th". You can also type "first ..." to get first activity`,
        metadata: "DEVELOPER_DEFINED_METADATA"
      }
    };
  }
  const elements = [];
  elements.push(this.activityList[idx]);
  logger.debug(`activityAsListElement: date ${this.date}; date: ${new moment(this.date).format("D")}; date: ${new moment(this.date).format("Do")}`);
  elements[0].subtitle = `"Activity ${idx + 1} on ${new moment(this.date).format("Do")}": ` + elements[0].subtitle; 
  let buttons = [];
  let prefix = `${this.date.getFullYear()}-${this.date.getMonth()}-${this.date.getDate()}-${idx}-`;
  if(idx > 0) {
    const payload = prefix.concat(`prev`);
    buttons.push({
      title: "Prev",
      type: "postback",
      payload: payload
    });
  }
  if(idx != (this.activityList.length - 1)) {
    const payload = prefix.concat(`next`);
    buttons.push({
      title: "Next",
      type: "postback",
      payload: payload
    });
  }
  if(buttons.length > 0) elements[0].buttons = buttons;
  
  let message = {
    recipient: {
      id: this.fbid
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: elements
        }
      }
    }
  };

  return message;
}

DayPlanner.parseActivityPostback = function(payload) {
  let contents = /^(\d+)-(\d+)-(\d+)-(\d)-(.*)/.exec(payload);  
  if(!contents) return null;
  const date = new Date(contents[1], contents[2], contents[3]);
  return {
    date: date,
    idx: parseInt(contents[4]),
    dir: contents[5]
  };
}

DayPlanner.parseDayItinPostback = function(payload) {
  let contents = /^(\d+)-(\d+)-(\d+)-(\d)-itin_second_set/.exec(payload);  
  if(!contents) return null;
  const date = new Date(contents[1], contents[2], contents[3]);
  const count = parseInt(contents[4]);
  return {
    date: date,
    number: count
  };
}

function visitDetails(dayPlan) {
  let plans = [];
  if(!dayPlan.visit) return plans;
  const visiting = dayPlan.visit;
  visiting.forEach(i => {
    plans.push(`Visit ${i}. Get <a href="https://www.google.com/maps/search/${encodeURIComponent(i)}">directions</a>`);
  });
  return plans;
}

function weatherDetails(dayPlan) {
  let plans = [];
  if(!dayPlan.weather) return plans;
  const weather = dayPlan.weather;
  if(!Array.isArray(weather)) { plans.push(weatherString(weather)); return plans; }
  // we have been sent an array of weather. That means there are multiple cities on the same day in the itinerary.
  weather.forEach(cityWeather => {
    plans.push(weatherString(cityWeather));
  });
  logger.debug(`weatherDetails: returning array of length ${plans.length}`);
  return plans;
}

function weatherString(weather) {
  let rain = "";
  if(weather.chanceofrain !== '0') rain += `; Chance of rain: <b>${weather.chanceofrain}%</b>`;
  let city = "";
  if(weather.city) city += ` at <b>${capitalize1stChar(weather.city)}</b>`;
  return `<div data-role="content" data-enhance="false">Weather${city}: Avg min temp: <b>${weather.min_temp}&degF</b>; Max temp: <b>${weather.max_temp}&degF</b>; It will be <b>${weather.cloud_cover}</b> today. ${rain}</div>`;
}

function flightDetails(dayPlan) {
  let plans = [];
  let flightPlans = `<div data-role="content" data-enhance="false">`;

  if(dayPlan.startTime) flightPlans += `Leaving ${capitalize1stChar(this.departureCity)} at <b>${dayPlan.startTime}</b>; `;
  if(dayPlan.arrivalTime) flightPlans += `Arriving in ${capitalize1stChar(this.arrivalCity)} at <b>${dayPlan.arrivalTime}</b>`;
  flightPlans += "</div>";
  if(dayPlan.startTime || dayPlan.arrivalTime) plans.push(flightPlans);
  logger.debug(`flightDetails: returning array of length ${plans.length}`);
  return plans;
}

function list(planList) {
  if(planList.length === 0) return "<li>No plans yet</li>";
  let list = "";
  planList.forEach(l => {
    list += `<li>${l}</li>`;
  });
  return list;
}

function capitalize1stChar(str) {
  return str.replace(/^[a-z]/g, function(letter, index, string) {
    return index == 0 ? letter.toUpperCase() : letter;
  });
}

module.exports = DayPlanner;