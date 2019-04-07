const DB = require('./db');
const dialogflow = require('dialogflow');
const uuid = require('uuid');
const logger = require('js-logger').get('Bot');

module.exports = class Bot {
	constructor() {
		this.version = '0.1';
		let url = 'mongodb://localhost:27017';
		if (process.env.PRODUCTION) url = 'mongodb://database:27017';
		this.db = new DB(url,'database');
		// Async connection
		this.db.connect().then(_=>{
			logger.info("Initialising db with data");
			this.db.initData();
		});
		// Create DF session
		const sessionId = uuid.v4();
		// Create a new session
		this.DF = {};
		this.DF.sessionClient = new dialogflow.SessionsClient();
		// TODO: move these into env vars
		const projectId = "test-53d52";
		this.DF.sessionPath = this.DF.sessionClient.sessionPath(projectId, sessionId);
	}
	async query(msg) {
		const request = {
			session: this.DF.sessionPath,
			queryInput: {
			  text: {
				text: msg,
				languageCode: 'en'
			  }
			}
		};
		// process the user's request and return an instance of DetectIntentResponse
		const responses = await this.DF.sessionClient.detectIntent(request);
		logging.info(responses);
		const result = responses[0].queryResult;
		return {
			response: result.fulfillmentText,
			intent: result.intent ? result.intent.displayName : '[UNKNOWN]'
		};
	}
};
