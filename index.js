import express from 'express';
import { MongoClient, ObjectId } from "mongodb";
import dotenv from 'dotenv';
import joi from 'joi';
import cors from 'cors';
import dayjs from 'dayjs';

dotenv.config();

const server = express();
server.use(express.json());
server.use(cors());

const mongoClient = new MongoClient(process.env.MONGO_URI);

const participantsSchema = joi.object({
    name: joi.string().required(),
});

const headersSchema = joi.object({
    user: joi.string().required(),
});

const messageSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().valid('message', 'private_message').required(),
});

server.get('/participants', async (req, res) => {
    
    try {
        await mongoClient.connect();
        const dbUOL = mongoClient.db('UOL');
        const participants = dbUOL.collection('participants');
        const participantsList = await participants.find().toArray();

        res.send(participantsList);
        mongoClient.close();
    } catch (error) {
        res.status(500).send(error);
        mongoClient.close();
    }
});

server.post('/participants', async (req, res) => {
    const user = req.body;

    try {
        await mongoClient.connect();
        const dbUOL = mongoClient.db("UOL");
        const participants = dbUOL.collection('participants');
        const messages = dbUOL.collection('messages');
        const participantsList = await participants.find().toArray();
        
        const validation = participantsSchema.validate(user);

        if (validation.error) {
            res.sendStatus(402);
            mongoClient.close();
            return;
        }
        if (participantsList.some(person => person.name === user.name)) {
            res.sendStatus(409);
            mongoClient.close();
            return;
        }
        
        await participants.insertOne({
            name: user.name.trim(),
            lastStatus: Date.now(),
        });
        await messages.insertOne({
            from: user.name,
            to: 'Todos',
            text: 'entra na sala...',
            type: 'status',
            time: dayjs().format('hh:mm:ss'),
        });
        
        res.sendStatus(201);
        mongoClient.close();
    } catch (error) {
        res.status(500).send(error);
        mongoClient.close();
    }
});

server.get('/messages', async (req, res) => {
    const numMessages = parseInt(req.query.limit);
    const user = req.headers.user;

    try {
        await mongoClient.connect();
        const dbUOL = mongoClient.db('UOL');
        const messages = dbUOL.collection('messages');
        const messagesList = await messages.find().toArray();
        const messagesToSend = messagesList.filter(message => message.from === user || message.to === user || message.type === 'message' || message.type === 'status');

        if (numMessages) {
            res.send(messagesToSend.slice(-numMessages));
            mongoClient.close();
            return;
        }

        res.status(200).send(messagesToSend);
        mongoClient.close();

    } catch (error) {
        res.status(500).send(error);
        mongoClient.close();
    }

});

server.post('/messages', async (req, res) => {
    const message = req.body;
    const sender = req.headers;

    try {
        await mongoClient.connect();
        const dbUOL = mongoClient.db('UOL');
        const participants = dbUOL.collection('participants');
        const messages = dbUOL.collection('messages');
        const participantsList = await participants.find().toArray();       
        const bodyValidation = messageSchema.validate(message);

        if (bodyValidation.error || !sender.user ||!participantsList.some(participant => participant.name === sender.user)) {
            res.sendStatus(422);
            mongoClient.close();
            return;
        }

        await messages.insertOne({
            from: sender.user,
            to: message.to,
            text: message.text,
            type: message.type,
            time: dayjs().format('hh:mm:ss'),
        });
        res.sendStatus(201);
        mongoClient.close();

    } catch (error) {
        res.status(500).send(error);
        mongoClient.close();
    }
});

server.delete('/messages/:idMessage', async (req, res) => {
    const { idMessage } = req.params;
    const user = req.headers.user;

    try {
        await mongoClient.connect();
        const dbUOL = mongoClient.db('UOL');
        const messages = dbUOL.collection('messages');
        const messagesList = await messages.findOne({ _id: new ObjectId(idMessage)});

        if (!messagesList) {
            res.sendStatus(404);
            mongoClient.close();
            return;
        }
        if (messagesList.from !== user) {
            res.sendStatus(401);
            mongoClient.close();
            return;
        }

        await messages.deleteOne({_id: new ObjectId(idMessage)});

        res.sendStatus(200);
        mongoClient.close();
    } catch (error) {
        console.log(error);
        res.status(500).send(error);
        mongoClient.close();
    }
})

server.post('/status', async (req, res) => {
    const user = req.headers.user;

    try {
        await mongoClient.connect();
        const dbUOL = mongoClient.db('UOL');
        const participants = dbUOL.collection('participants');
        const participantsList = await participants.find({name: user}).toArray();

        if (!participantsList) {
            res.sendStatus(404);
            mongoClient.close();
            return;
        }

        await participants.updateOne({
            name: user
        }, { $set: 
            { 
                lastStatus: Date.now(),
            }
        });

        res.sendStatus(200);
        mongoClient.close();
    } catch (error) {
        res.status(500).send(error);
        mongoClient.close();
    }
});

setInterval(async () => {
    await mongoClient.connect();
    const dbUOL = mongoClient.db('UOL');
    const participants = dbUOL.collection('participants');
    const messages = dbUOL.collection('messages');
    const participantsList = await participants.find().toArray();

    for (let i = 0; i < participantsList.length; i++) {
        const participant = participantsList[i];
        if (Date.now() - participant.lastStatus > 10000) {
            await participants.deleteOne({ name: participant.name});
            await messages.insertOne({
                from: participant.name,
                to: 'Todos',
                text: 'sai da sala...',
                type: 'status',
                time: dayjs().format('hh:mm:ss'),
            });
        }
    }

    mongoClient.close();
}, 15000);

server.listen(5000, () => {
    console.log('Servidor rodando!');
});