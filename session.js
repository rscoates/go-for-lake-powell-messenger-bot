'use strict';
const _=require('lodash');
const Log = require('./logger');
const logger = (new Log()).init();
const TripData = require('./trip-data');

/*
A session has a 1:1 relationship with a user and their trips. A session represents a user. Each user and their trips will have exactly one session at any given time. Today, the scope of a session is tied to the lifetime of this webserver. At any given time, the session will have one trip context that indicates which trip a user is talking about.

TODO: Re-think this decision when sessions need to be persisted across process restarts.  

Trip data contains both information about a group and user specific information. Group information should be visible to everyone and user specific information should be visible only to the individual.

user: {
  group: [groupId,],
  trips: {
    tripName: TripData,
    ...
  }
}

group: {
  users: [fbid list],
  trip: {
    tripData: TripData
  }
}

sessionId -> {
  tripNameInContext: trip name in context,
  awaitingNewTripNameInContext: true or false,
  fbid: facebookUserId, 
  sessionId: session Id,
  botMesgHistory: [Array of chat messages],
  trips: {
    tripName: {
      aiContext: {}, 
      humanContext: {}
      tripData: tripData, // TripData object
    }
    tripName2: {
      ...
    }
  }
  ...
}

At any given time, a user can be chatting about multiple trips to a human. Ongoing conversation with a user about trips are captured in the tripName json object. The tripNameInContext specifies the trip that a user is talking about at a specific point in time. If this is undefined, we ask the user to choose a trip they want to talk about or create a new trip (see webhook-post-handler.js). 

aiContext contains AI related context (Wit.AI). Most of the keys are story specific entries. See the actions variable for context details in each action. Once a specific story's end is reached (as defined in the wit UI), the done flag is set to true so that this context is deleted. This way, we don't carry context beyond stories, thereby confusing wit
aiContext -> {
  sessionId: // session id
  done: true of false, 
  ... // list of entries specific to an action
}

humanContext contains information about a specific trip being discussed with a human. 
humanContext -> {
  sessionId: // session id
  fbid: //facebook user id of the human who is supposed to respond to these conversations
  conversations: { // set of current ongoing conversations for this trip with this user
    seq -> { // sequence number of the first message from a user that started this conversation. 
      awaitingResponse: boolean,
      messagesSent: [], // a list of messages sent by the human in response to the original message.
      originalMessage: String // original message sent from the user
    }
    ...
  }
}
*/

const MY_RECIPIENT_ID = "1120615267993271";

function Session(fbid,sessionId) {
  this.sessionId = sessionId;
  this.fbid = fbid;
  this.botMesgHistory = [];
  this.trips  = {};
  // TODO: Persist this session here.
  retrieveSessionData.call(this);
}

// TODO: Implement
Session.prototype.nooneAwaitingResponse = function() {
  return false;
}

Session.prototype.humanContext = function() {
  return this.findTrip().humanContext;
}

Session.prototype.tripData = function() {
  return this.findTrip().tripData;
}

Session.prototype.allTrips = function() {
  const tripDataList = [];
  Object.keys(this.trips).forEach(k => {
    console.log(`pushing trip for session ${this.sessionId}`);
    tripDataList.push(this.trips[k].tripData);
  });
  return tripDataList;
}

Session.prototype.addTrip = function(tripName) {
  const encTripName = TripData.encode(tripName);
  this.tripNameInContext = encTripName;
  this.rawTripNameInContext = tripName;
  if(_.isUndefined(this.trips[encTripName])) {
    // this is only possible in case of a new trip created in this session. 
    logger.info(`Creating new trip for session ${this.fbid} for trip ${this.tripNameInContext}`);
    // define a tripName json object.
    this.trips[encTripName] = { 
      aiContext: {
        sessionId: this.sessionId
      },
      humanContext: {
        sessionId: this.sessionId,
        // TODO: Need a better way to get the human's fbid than using my messenger's senderId.
        fbid: MY_RECIPIENT_ID,
        conversations: {}
      },
      tripData: new TripData(tripName, true /* persist */)
    };
    // TODO: Persist trip information in this session.
  }
}

Session.prototype.findTrip = function() {
  return this.trips[this.tripNameInContext];
}

Session.prototype.deleteAiContext = function() {
  const trip = this.findTrip();
  trip.aiContext = {};
  // TODO: Persist information in this session if needed.
}

Session.prototype.updateAiContext = function(context) {
  const trip = this.findTrip();
  trip.aiContext = context;
  // TODO: Persist information
}

function retrieveSessionData() {
  try {
    const file = `${sessionsBaseDir}/this.fbid`;
    fs.accessSync(file, fs.F_OK);
    try {
      this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    catch(err) {
      logger.error("error reading from ", file, err.stack);
    }
  }
  catch(err) {
    logger.info(`file does not exist for session ${this.fbid}`);
    this.data = {};
  }
}

module.exports = Session;