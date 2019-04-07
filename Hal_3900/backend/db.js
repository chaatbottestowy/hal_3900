const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');
const logger = require('log4js').getLogger('Database');
logger.level = 'info';

// Helper function to make fs.readdir
// actually async
function asyncReadDir(path) {
	return new Promise((resolve,reject)=>{
		fs.readdir(path,(err,items)=>{
			if (err) reject(err);
			resolve(items);
		})
	})
}

function calcScore(tags, candidate) {
	return candidate.tags.reduce(
			(acc, tag) => acc + (tags.includes(tag["name"]) ? tag.salience : 0),
			0
	);
}

module.exports = class DB {
	constructor (dbUrl, dbName) {
		this.dbConn = null;
		this.dbUrl = dbUrl;
		this.dbName = dbName;
	}
	
	async connect() {
		const mongoConfig = {
			useNewUrlParser: true
		};
		const client = await MongoClient.connect(this.dbUrl,mongoConfig);
		logger.info("Connected to database successfully");
		this.dbConn = client.db(this.dbName);
	}
	
	async dump(objects, collection='documents') {
		const collection = this.dbConn.collection(collection);
		const res = await collection.insertMany(objects);
		logger.info(`Inserted ${res.insertedCount} objects into collection ${collection}`);
	}
	
	// feed me an array of db objects and the name of collection they belong to
	async addToCollection(objects, collection='documents') {
		const collectionRef = this.dbConn.collection(collection);
		const res = await collectionRef.insertMany(objects);
		logger.info(`Inserted ${res.insertedCount} objects into collection ${collection}`);
	}
	
	async search(obj, collection='documents') {
		const collectionRef = this.dbConn.collection(collection);
		let results = [];
		results = await collectionRef.find(obj).toArray();
		cursor.close();
		return results;
	}
	
	async initData () {
		let knownCollections = await this.dbConn.listCollections().toArray();
		knownCollections = knownCollections.map(x=>x.name);
		if (knownCollections.indexOf("forum") !== -1) {
			logger.info(`Detected collections, skipping init step`);
			return;
		}
		
		const forumDir = "data/data_forum";
		const dataDir = "data/data_page";
	
		logger.info(`Reading forum posts from ${forumDir}`);
		let items = await asyncReadDir(forumDir);
		for (const item of items) {
			await this.addToCollection(require(`./${forumDir}/${item}`).posts, 'forum');
		}

		logger.info(`Reading blocked and grouped posts from ${dataDir}`);
		items = await asyncReadDir(dataDir);
		for (const item of items) {
			const dataObject = require(`./${dataDir}/${item}`);
			await this.addToCollection(dataObject.grouped, 'grouped');
			await this.addToCollection(dataObject.block, 'block');
		}
	};
	
	async findAllFromCollection(collectionName) {
		const collection = this.dbConn.collection(collectionName);
		let results = [];
		const cursor = await collection.find({});
		results = await cursor.toArray();
		cursor.close();
		return results;
	};
	
	async findForumQuestionsByTopic(tag) {
		const collection = this.dbConn.collection('forum');
		const cursor = await collection.find({
			tags : {
				$elemMatch: {
					"name" : tag
				}
			}
		}, {tags: 0, _id:0});
		const results = await cursor.toArray();
		cursor.close();
		return results;
	}
	
	async findByCollectionAndTag(tag, collectionName) {
		const collection = this.dbConn.collection(collectionName);
		// find all objects where tags contains an array elem with name = tag
		const cursor = await collection.find({ tags: { $elemMatch: { "name": tag } } } );
		const results = await cursor.toArray();
		cursor.close();
		return results;
	};
	
	async findByCollectionAndAllTags(tagsArray, collectionName) {
		const collection = this.dbConn.collection(collectionName);
		// find all objects where tags contains an array elem with name = tag
		const cursor = await collection.find({ "tags.name" : { $all: tagsArray } } );
		const results = await cursor.toArray();
		cursor.close();
		return results;
	};
	
	async findAllByTag(tag) {
		const grouped = await this.findByCollectionAndTag(tag, this.dbConn, 'grouped');
		const block = await this.findByCollectionAndTag(tag, this.dbConn, 'block');
		const forum = await this.findByCollectionAndTag(tag, this.dbConn, 'forum');
		
		return {grouped, forum, block};
	};
	
	async getUniqueTagsFromCollection(collectionName) {
		const collection = this.dbConn.collection(collectionName);
		return await collection.distinct("tags.name");
	};
	
	async getAllUniqueTags() {
		const grouped = await this.getUniqueTagsFromCollection(this.dbConn, 'grouped');
		const block = await this.getUniqueTagsFromCollection(this.dbConn, 'block');
		const forum = await this.getUniqueTagsFromCollection(this.dbConn, 'forum');
		
		// reduce to single array of unique
		let tagSet = new Set(grouped);
		block.map(b=>tagSet.add(b))
		forum.map(f=>tagSet.add(f))
		return Array.from(tagSet);
	};
	
	async getDataPoints(tags) {
		let candidates = await this.findAllFromCollection('grouped');
		candidates = candidates.concat(await this.findAllFromCollection('block'));
		candidates = candidates.concat(await this.findAllFromCollection('forum'));

		//calculate scores for each candidate
		candidates = candidates.map((candidate)=>{
				return {
						...candidate,
						_score: calcScore(tags, candidate)
				}
		});
		
		// sort by score
		candidates = candidates.sort((a,b)=> b._score - a._score);
		
		// filter out duplicates
		const response = candidates.filter((value, index, self)=>self.indexOf(value) === index);
		return response.slice(0,4); // output top 3 results
	};

	async train(bestResponse, ct, tags) {
		if(ct == "block"){
			for(var i =0; i< tags.length;i++){
				this.dbConn.ct.update({"text" :  bestResponse,"tags.name": tags[i]}, {$set:{"tags.theta" : "tags.theta"+"tags.sailence"}});
			}
		} else if(ct == "forum"){
			for(var i =0; i< tags.length;i++){
				this.dbConn.ct.update({"answers": bestResponse,"tags.name":tags[i]},{$set:{"tags.theta" : "tags.theta"+"tags.sailence"}});
			}
		}
	};
};
