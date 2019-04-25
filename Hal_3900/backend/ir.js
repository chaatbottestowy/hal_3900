const logger = require('log4js').getLogger('IR');
logger.level = 'info';

/*
 * Given a candinate and a list of search tags
 * calculates the score of the candidate
 */
function calcScore(tags, candidate) {
    //final_score = matched_tags_sailence + matched_tags_theta
    return candidate.tags.reduce(
        (acc, tag) => acc + (tags.includes(tag["name"]) ? tag.salience + tag.theta: 0),
        0
    );
}

/*
 * Given a list of search tags, a intent and a list of candinates
 * returns the top 4 highest scoring data points.
 */
function generateOptions(tags, candidates, intent) {
    //calculate scores for each candidate
    candidates = candidates.map((candidate)=>{
        return {
            ...candidate,
            _score: calcScore(tags, candidate),
        }
    });
    // Kill all non intent matched items
    candidates = candidates.filter(c => c.intent === intent);
    
    // sort by score
    candidates = candidates.sort((a,b) => b._score - a._score);
    
    // filter out duplicates
    const response = candidates.filter((value, index, self) => self.indexOf(value) === index);
    
    return response.slice(0,4); // output top 4 results
}

/*
 * Given a list of search tags, a intent and a list of candinates
 * returns the top 4 highest scoring data points text and a
 * context object which is used to train the database on
 * feedback.
 */
async function performIR(dbConn, tags, candidates, intent) {
    const options = generateOptions(tags, candidates, intent);
    const result = [];
    for (const option of options) {
        if (option["type"] === "question") {
            const search = {
                "question": {
                    $eq: option["text"]
                }
            }
            const posts = await dbConn.search(search, collection="forum");
            result.push(pickAnswer(posts[0]));
        } else {
            result.push(option["text"]);
        }
    }
    return {
        options: result,
        context: {
            rawOptions: options,
            options: result,
            seachTags: tags
        }
    };
}

/*
 * Given a forum post, picks the best answer to return to the 
 * user
 */
function pickAnswer(post) {
    const scope = post.answers.reduce((acc, answer) => acc + answer["theta"], 0);
    let seed = Math.floor(Math.random() * scope)+1; // get random int number in [1,scope]
    let resp = null;
    logger.info(seed);
    for (const answer in post.answers) {
        if (answer.theta >= seed) {
            resp = answer.text;
            break;
        } else {
            seed -= answer.theta;
        }
    }
    // Fallback, if no answer was found pick first
    if (resp === null) resp = post.answers[0].text;
    return resp;
}

module.exports = {performIR, pickAnswer};