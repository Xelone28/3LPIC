const amqp = require('amqplib');

const { v4: uuidv4 } = require('uuid');

async function publishTaskToQueue(filePath, language, userId, exercise) {
    try {
        const fileId = uuidv4();

        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();

        const queueName = 'taskQueue';
        await channel.assertQueue(queueName);

        const task = {
            fileId: fileId,
            filePath: filePath,
            exercise: exercise,
            language: language,
            userId: userId
        };

        channel.sendToQueue(queueName, Buffer.from(JSON.stringify(task)));
        console.log('Task published to taskQueue:', task);

        await channel.close();
        await connection.close();
    } catch (error) {
        console.error('Error publishing task to queue:', error);
        throw error;
    }
}
module.exports = { publishTaskToQueue };

