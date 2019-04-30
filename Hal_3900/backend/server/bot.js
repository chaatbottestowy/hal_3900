const DB = require('./db');
const dialogflow = require('dialogflow');
const uuid = require('uuid');
const DFconfig = require('./DFServiceAccount_wordbag.json');
const training = require('./training');
const { performIR } = require('./ir');
const stats = require('./stats.js');
const logger = require('log4js').getLogger('Bot');
logger.level = 'info';

function hasTag(c, t) {
	return c.tags.map(x => x.name).includes(t)
}

module.exports = class Bot {
	constructor() {
		this.version = '0.1';

		this.db = new DB();
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
		this.DF.sessionPath = this.DF.sessionClient.sessionPath(DFconfig.project_id, sessionId);
	}

	async train(queryId, choice) {
		const query = {
			'_id': {
				$eq: queryId
			}
		}
		logger.info(`search for query id ${queryId}`);
		const all = await this.db.search(query, 'query_contexts');
		await training(this.db, all[0], choice);
	}

	async getCandidates(course, tags) {
		let candidates = await this.db.findByCourseCode(course, 'block');
		
		// for (const tag of tags) {
		// 	const matches = collection.filter(c => hasTag(c, tag));
		// 	candidates = candidates.concat(matches);
		// };
		console.log(candidates.length);
		if (tags.length > 0) {
			candidates = candidates.filter(item => {
				// check if any tags on the candidate match the searchTags
				return item.tags.some((tag) => {
					return tags.indexOf(tag.name) >= 0;
				});
			})
		}

		return candidates
	}

	async generateOptions(course, searchTags, intent) {
		const candidates = await this.getCandidates(course, searchTags);
		let { options, context } = await performIR(this.db, course, searchTags, candidates, intent);
		const id = uuid.v4();
		context["_id"] = id;

		// filter duplicate options text out
		options = [...new Set(options)];

		options = options.map(x => {
			return {
				queryId: id,
				text: x
			 }
		});
		logger.info(`Saving Query with id ${id}`);
		await this.db.addToCollection([context], 'query_contexts');

		// update query stats
		await stats.updateQueryStats(this.db, course, searchTags);


		return options;
	}

	async query(course, msg) {
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
		// console.log(request);
		const responses = await this.DF.sessionClient.detectIntent(request);
		const result = responses[0].queryResult;

		if (result.action === '') {    // do custom fulfillment for the query
			// get parameters from DialogFlow object
			const intent = result.intent.displayName;
			let searchTags = responses[0].queryResult.parameters.fields.word_bag.listValue.values;
			searchTags = searchTags.map(x=>x.stringValue);

			// search for responses
			let options;
			if (intent === 'quiz'){
				options = await this.db.getQuizQuestions(course, searchTags);
			} else {
				options = await this.generateOptions(course, searchTags, intent);
				options = options.map(x => { return { ...x, question: msg } });
			}
			return {
				response: result.fulfillmentText,
				options,
				intent: result.intent ? result.intent.displayName : '[UNKNOWN]'
			};
		} else {    // Use Dialogflow fulfillment
			console.log(result.action);

			// count unknown queries in course stats
			if (result.action === "input.unknown") {
				stats.countMissedQuery(this.db, course);
			}
			return {
				response: result.fulfillmentText,
				options: null,
				intent: result.intent ? result.intent.displayName : '[UNKNOWN]'
			};
		}
	}
};