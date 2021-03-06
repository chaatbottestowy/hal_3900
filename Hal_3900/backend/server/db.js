const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');
const logger = require('log4js').getLogger('Database');
const dataExtraction = require('./data_extraction/data_extraction.js');
const stats = require('./stats.js');
logger.level = 'info';

// Stolen from 
// https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

module.exports = class DB {

	constructor () {
		let url = 'mongodb://localhost:27017';
		if (process.env.PROD) url = 'mongodb://database:27017';
		this.dbConn = null;
		this.dbUrl = url;
		this.dbName = 'database';
	}
	
	/*
	 * Connects to the database server
	 */
	async connect() {
		const mongoConfig = {
			useNewUrlParser: true
		};
		const client = await MongoClient.connect(this.dbUrl,mongoConfig);
		logger.info("Connected to database successfully");
		this.dbConn = client.db(this.dbName);
		//logger.info(`connect to:${dbConn}`)
	}
	
	/*
	 * Adds a array of objects to the database under the 
	 * specified collection, if collection is not supplied it defaults to 
	 * the documents collection
	 */
	async addToCollection(objects, collection) {
		if (collection === undefined) collection = 'documents';
		const collectionRef = this.dbConn.collection(collection);
		const res = await collectionRef.insertMany(objects);
		logger.info(`Inserted ${res.insertedCount} objects into collection ${collection}`);
		return res;
	}
	
	/*
	 * Given a mongodb search object and a target collection
	 * returns a array of matching objects
	 */
	async search(obj, collection) {
		if (collection === undefined) collection = 'documents';
		const collectionRef = this.dbConn.collection(collection);
		let results = [];
		results = await collectionRef.find(obj).toArray();
		return results;
	}

	/*
	 * Given a mongodb search object and a target collection
	 * deleted the first matching object
	 */
	async delete(obj, collection) {
		if (collection === undefined) collection = 'documents';
		const collectionRef = this.dbConn.collection(collection);
        await collectionRef.deleteOne(obj)
	}

	/*
	 * Given a set of pages to scrape, runs the data extraction
	 * program on them to generate a set of data which is automatically
	 * appended to the database
	 * 
	 * pagesToScrape must be a js object formatted as per spec in wiki
	 */
	async runDataExtraction (pagesToScrape) {
		if (!this.connected) {
			await this.connect();
		}

		await dataExtraction.getDataToDb(pagesToScrape, this);
	}
	
	/*
	 * Checks if the database is empty and if so populates it with the 
	 * last backed up dump of data. 
	 * Relies on the database having already been connected to. 
	 */
	async initData () {
		let knownCollections = await this.dbConn.listCollections().toArray();
		knownCollections = knownCollections.map(x=>x.name);
		if (knownCollections.indexOf("forum") !== -1) {
			logger.info(`Detected collections, skipping init step`);
			return;
		}

		const filename = '../data/db_backup.json';
		if (fs.existsSync(filename)){
			logger.info(`Restoring data from backup`);
			this.restore(filename);
			return;
		}

		logger.error("No data loaded in the DB and no backup file. Add some course data");
	};
	

	/*
	 * get quiz questions
	 */
	scoreQuizQuestion (tags, c, profileTags) {
		let score = 0.0;
		let tagScore = 0.0;
		for (const t of c.tags) {
			tagScore = 0.0;
			if (tags.includes(t.name.toLowerCase())) {
				tagScore = t.theta;
			}
			for (const tagName of Object.keys(profileTags)) {
				if (tagName.toLowerCase() == t.name.toLowerCase()) {
					logger.info(`Bumping tag ${t.name} by ${profileTags[tagName]}`)
					tagScore *= profileTags[tagName];
				}
			}
			score += tagScore;
		}
		
		return score;
	}

	async getQuizQuestions(tags, courseCode, username) {
		tags = tags.map(x => x.toLowerCase())
		const query = {
			courseCode: {
				$eq: courseCode
			}
		};
		const userQuery = {
			zid: {
				$eq: username
			}
		}
		let candidates = await this.search(query, 'quiz');
		let results = await this.search(userQuery, 'users');
		let profile = {};
		if ('profile' in results[0]) profile = results[0].profile;
		let profileTags = {};
		if (courseCode in profile) profileTags = profile[courseCode];
		candidates = candidates.map(x => {
			return {
				...x,
				'_score': this.scoreQuizQuestion(tags, x, profileTags)
			}
		})
		// sort by score
		candidates = candidates.sort((a, b) => b._score - a._score);
		// if no tags were supplied jumble the list
		if (tags.length <= 0) {
			shuffleArray(candidates);
		}
		// get stats or make if not exists
		await stats.updateQuizStats(this, courseCode, tags);
		
		return candidates;
	}

	/*
	 * Given a collection name will return a array of all 
	 * objects under that collection
	 */
	async findAllFromCollection(collectionName) {
		const collection = this.dbConn.collection(collectionName);
		let results = [];
		const cursor = await collection.find({});
		results = await cursor.toArray();
		cursor.close();
		return results;
	};

	/*
	 * Given a course and collection will search all objects
	 * under the collection for objects tagged as belonging
	 * to the specified course. Returns the result in a array. 
	 */
	async findByCourseCode(courseCode, collectionName) {
		const collection = this.dbConn.collection(collectionName);
		// find all objects where tags contains an array elem with name = tag
		const cursor = await collection.find({ courseCode: courseCode });
		const results = await cursor.toArray();
		cursor.close();
		return results;
	};
	
	/*
	 * Backups the current database into a json file.
	 */
	async backup() {
		const filename = '../data/db_backup.json';
		const block = await this.findAllFromCollection('block');
		const forum = await this.findAllFromCollection('forum');
		const courses = await this.findAllFromCollection('courses');
		const quiz = await this.findAllFromCollection('quiz');
		const stats = await this.findAllFromCollection('courseStats');

		fs.writeFileSync(filename, JSON.stringify({block, forum, courses, quiz, stats}));
	}

	/*
	 * restores database from a backup file
	 * assumes database is empty.
	 */
	async restore(backup_file) {
		const items = require(backup_file);
		this.addToCollection(items.forum, 'forum');
		this.addToCollection(items.block, 'block');
		this.addToCollection(items.courses, 'courses');
		this.addToCollection(items.quiz, 'quiz');
		this.addToCollection(items.stats, 'courseStats');
	}

};

