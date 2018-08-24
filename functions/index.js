const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

const db = admin.database();

exports.addMessage = functions.database.ref('commands/addMessage/{roomId}').onCreate((snapshot, context) => {
    const message = snapshot.val();
    const roomId = context.params.roomId;
    const refMsg = '/chatRooms/' + roomId;
    const rootRef = snapshot.ref.root;
    const time = new Date().getTime();

    let data;

    db.ref('/users/').orderByChild('chatId').equalTo(message.receiverChatId).once('value')
        .then((snap) => {
            addChatRoom(snap.val());
            return snap.val();
        }).catch((error) => console.log(error));

    function addChatRoom(chatRooms) {
        data = chatRooms;
        const objKey = Object.keys(chatRooms)[0];
        if (!data[objKey].chatRooms) {
            db.ref('/users/' + objKey + '/chatRooms/0').set(roomId);
        } else {
            const chat_Rooms = data[objKey].chatRooms;
            let index = chat_Rooms.length;
            const chats = [];
            for (const key of Object.keys(chat_Rooms)) {
                chats.push(chat_Rooms[key]);
            }
            if (!chats.includes(roomId)) {
                db.ref('/users/' + objKey + '/chatRooms/' + index).set(roomId);
            }
        }
    }
    let dataSender;
    db.ref('/users/').orderByChild('chatId').equalTo(message.senderChatId).once('value')
        .then((snap) => {
            addChatRoom2(snap.val());
            return snap.val();
        }).catch((error) => console.log(error));

    function addChatRoom2(chatRooms) {
        dataSender = chatRooms;
        const objKey = Object.keys(chatRooms)[0];
        if (!dataSender[objKey].chatRooms) {
            db.ref('/users/' + objKey + '/chatRooms/0').set(roomId);
        } else {
            const chat_Rooms = dataSender[objKey].chatRooms;
            let index = chat_Rooms.length;
            const chats = [];
            for (const key of Object.keys(chat_Rooms)) {
                chats.push(chat_Rooms[key]);
            }
            if (!chats.includes(roomId)) {
                db.ref('/users/' + objKey + '/chatRooms/' + index).set(roomId);
            }
        }
    }
    rootRef.child(refMsg + '/lastMessage').set(message);
    rootRef.child(refMsg + '/messages/' + time).set(message);

    return rootRef.child('commands/addMessage/' + roomId).remove();
});

exports.createUser = functions.auth.user().onCreate(user => {
    const email = user.email;
    let chatId = null;
    const index = user.uid;
    const data = {
        email: email,
        chatId: chatId
    };

    db.ref('/chatIdCounter').once('value')
        .then((snap) => {
            const id = snap.val();
            if(id) {
                chatId = id + 1;
                db.ref('/chatIdCounter').set(chatId);
            }
            return chatId;
        })
        .then((id) => {
            data.chatId = id;
            return db.ref('/users/' + index).set(data);
        })
        .catch((error) => console.log(error));

    return;
});

exports.getUsers = functions.https.onRequest((req, res) => {
    const uid = req.query.uid;
    const quantity = req.query.quantity;
    if (!uid) {
        res.status(500).json('Parametr uid is required !')
    }

    let allUsers = {};
    let userKeys = [];
    let matchesKeys = [];
    let sortedUsers;
    getUsers();

    function getUsers() {
        db.ref('users/').once('value')
            .then((users) => {
                allUsers = users.val();
                userKeys = Object.keys(allUsers);
                for (let key of userKeys) {
                    if (allUsers[key]) {
                        allUsers[key]['id'] = key;
                    }
                }
                return
            })
            .then(() => {
                checkUsers();
                return
            })
            .then(() => {
                delete allUsers[uid];
                userKeys = Object.keys(allUsers);

                db.ref('users/' + uid + '/blackList').once('value')
                .then((val) => {
                    const data = val.val();
                    if(data) {
                        const blackListKeys = Object.keys(data).map((k) => data[k]);
                        for(let i = 0; i < blackListKeys.length; i++) {
                            delete allUsers[blackListKeys[i]];
                            let index = userKeys.indexOf(blackListKeys[i]);
                            if (index > -1) {
                                userKeys.splice(index, 1);
                            }
                        }
                        if (req.query.quantity) {
                            res.status(200).json({users: getNextUsers(quantity)});
                        } else {
                            res.status(200).json({users: allUsers});
                        }
                        return
                    } else {
                        if (req.query.quantity) {
                            res.status(200).json({users: getNextUsers(quantity)});
                        } else {
                            res.status(200).json({users: allUsers});
                        }
                        return
                    }
                    sortedUsers = data;
                })
                return
            })
            .catch((error) => {
                console.log(error);
                res.status(500).send(error)
            });
    }

    function checkUsers() {
        if (allUsers[uid].matches !== undefined) {
            matchesKeys = Object.keys(allUsers[uid].matches);
            for (const k of matchesKeys) {
                delete allUsers[k];
            }
        }
    }

    function getNextUsers(quantity) {
        userKeys = Object.keys(allUsers);
        const result = [];
        for (let i = 0; i < quantity; i++) {
            if (allUsers[userKeys[i]]) {
                allUsers[userKeys[i]]['id'] = userKeys[i];
            }
            if (allUsers[userKeys[i]]) {
                result.push(allUsers[userKeys[i]]);
            }
        }

        return result;
    }
    
});

exports.getUsersByFilter = functions.https.onRequest((req, res) => {
    const uid = req.query.uid;
    const ageMin = Number(req.query.ageMin);
    const ageMax = Number(req.query.ageMax);
    const location = req.query.location;
    const seek = req.query.seek;
    const gender = req.query.gender;
    const page = Number(req.query.page);
    const itemsPerPage = 20;
    let pages;

    if (!uid || !gender || !ageMin || !ageMax || !location || !seek || !page) {
        res.status(500).json('Parameters uid, age, location, seek, gender and page are required !');
    }

    if (ageMin > ageMax ) {
        res.status(500).json('Parameter ageMax have to be always bigger or equal to ageMin !');
    }

    let users = {};
    let userKeys = [];
    let result = [];

    getUsers();

    function getUsers() {
        db.ref('users/').orderByChild('gender').equalTo(gender).once('value')
        .then((allUsers) => {
            const data = allUsers.val();
            if (data) {
                users = data;
                userKeys = Object.keys(data);
            }
            return
        })
        .then(() => {
            checkUser();
            return
        })
        .then(() => {
            userKeys = Object.keys(users);
            pages = Math.ceil(userKeys.length / itemsPerPage);
            for (let i = (page - 1) * itemsPerPage; i < (page * itemsPerPage); i++ ) {
                if (users[userKeys[i]]) {
                    users[userKeys[i]]['id'] = userKeys[i];
                }
                if (users[userKeys[i]]) {
                    result.push(users[userKeys[i]]);
                }
            }
            return
        })
        .then(() => {
            res.status(200).json({
                users: result,
                pages: pages,
                currentPage: page
            });
            return
        })
        .catch((error) => {
            console.log(error);
            res.status(500).send(error)
        });
    }

    function checkUser() {
        for (const key of userKeys) {
            if (key === uid) {
                delete users[uid];
            }
            else if (!users[key].age || users[key].age < ageMin || users[key].age > ageMax) {
                delete users[key];
            }
            else if (!users[key].city || users[key].city && users[key].city.toLowerCase() !== location.toLowerCase()) {
                delete users[key];
            }
            else if (!users[key].seeking || users[key].seeking !== seek) {
                delete users[key];
            }
        }
    }
});