/*
 * Returns a monogodb mutator to multiply
 * the matching tags from a previous search
 * thetha value by num
 */
function multiplyTag(num) {
    return {
        $mul:{
            "tags.$.theta" : num
        }
    }
}

/*
 * Returns a monogodb mutator to increment
 * the matching answers from a previous search
 * thetha value by num
 */
function incrementAnswer(num) {
    return {
        $inc:{
            "answers.$.theta" : num
        }
    }
}

/*
 * Given a id and a tag will bump the thetha value
 * for the tag up
 */
function bumpThetha(dbConn, id, tag, val) {
    const collection = dbConn.dbConn.collection('block');
    const search = { "_id": id, "tags.name": tag };
    collection.updateOne(search, multiplyTag(val));
}

/*
 * Given a id and a tag will bump down then thetha value
 * for the tag. 
 */
function penaliseTag(dbConn, id, tag, val) {
    const collection = dbConn.dbConn.collection('block');
    const search = { "_id": id, "tags.name": tag };
    collection.updateOne(search, multiplyTag(val));
}

/*
 * Training, takes a query context and a user choice
 * to adjust values in the database.
 *     dbConn     - The db connection
 *     rawOptions - Raw datapoints returned from tag search  
 *     options    - All options presented to the user
 *     best       - The index of the best answer the user chose
 *     tags       - The original SearchTags
 */
module.exports = async function training(dbConn, context, best, sensitivity) {
    const {rawOptions, options, searchTags} = context;
    // TODO: context contains course, use it

    searchTags.map(x => {
        bumpThetha(dbConn, rawOptions[best]["_id"], x, 1 + sensitivity);
        [0,1,2,3].filter(i=>i != best)
        .map(i => penaliseTag(dbConn, rawOptions[i]["_id"], x, 1 - sensitivity))
    });
    
    // If the best response was a question, increment answer relevance by 1
    if (rawOptions[best].type === "question") {
        const collection = dbConn.collection('forum');
        const search = {
            "question": rawOptions[best].text,
            "answers.text": options[best]
        };
        collection.updateOne(search, incrementAnswer(1));
    }
};
