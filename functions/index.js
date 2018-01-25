const cors = require('cors')({ origin: true });
const sanitizeHtml = require('sanitize-html');

// Firebase SDK call to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

const admin = require('firebase-admin');
// The Firebase Admin SDK to access the Firebase Realtime Database. const admin = require('firebase-admin'); 
// new
admin.initializeApp(functions.config().firebase); // new 

const app = require('express')();

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept"
    );
    next();
});


app.get(['/', '/:id'],
    functions.https.onRequest((req, res) => {
        const postID = req.params.id;
        let reference = 'posts';
        reference += postID ? '/' + postID : '';
        cors(req, res, () => {
            return admin
                .database()
                .ref(reference)
                .once('value')
                .then((snapshot) => {
                    if (snapshot.val() !== null) {
                        res.status(200).send(JSON.stringify(snapshot));
                    } else {
                        res.status(404).send(JSON.stringify({ message: `Post with ID ${postID} not found!` }));
                    }
                });
        });
    })
);

app.post('/',
    functions.https.onRequest((req, res) => {
        cors(req, res, () => {

            const tokenId = req.body.token;

            admin
                .auth()
                .verifyIdToken(tokenId)
                .then((decodedUser) => {
                    let content = req.body.content ? sanitizeHtml(req.body.content, { allowedTags: [], allowedAttributes: [] }) : null;
                    if (!content) {
                        res.status(400).send({ erorr: 'Missing Content!' });
                        return;
                    }

                    let title = req.body.title ? sanitizeHtml(req.body.title, { allowedTags: [], allowedAttributes: [] }) : content.substr(0, 20) + '...';
                    let postDate = admin.database.ServerValue.TIMESTAMP;
                    let postData = {
                        author: decodedUser.name,
                        title: title,
                        content: content,
                        created: postDate
                    };
                    let postKey = admin
                        .database()
                        .ref('posts')
                        .push()
                        .key;

                    admin
                        .database()
                        .ref('/posts')
                        .child(postKey)
                        .set(postData, () => {
                            return admin
                                .database()
                                .ref('/posts/' + postKey)
                                .once('value')
                                .then((snapshot) => {
                                    if (snapshot.val()) {
                                        let postJSON = snapshot.val();
                                        postJSON.id = postKey;
                                        res.send(JSON.stringify(postJSON));
                                    } else {
                                        res.status(500).send({ error: "Error while saving post!" });
                                    }
                                })
                        })

                }).catch(err => { res.send(401).send(err) });
        });
    })
)

// List all the posts under the path /posts/
exports.posts = functions.https.onRequest((req, res) => {
    // Handle routing of /posts without a trailing /,
    if (!req.path) {
        // prepending "/" keeps query params, path params intact
        req.url = `/${req.url}`;
    }
    return app(req, res);
});