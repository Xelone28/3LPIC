const amqp = require('amqplib');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const pool = require('./databaseCon');

const runParametersSum = [[1, 1], [2, 2], [5, 5]];
const resultSum = [2, 4, 10];

const runParametersDivision = [[1, 1], [10, 2], [48, 2]];
const resultDivision = [1, 5, 24];

async function startWorker() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const queueName = 'taskQueue';
        await channel.assertQueue(queueName);
        console.log('Worker waiting for messages...');

        channel.consume(queueName, (message) => {
            if (message !== null) {
                const task = JSON.parse(message.content.toString());
                console.log('Received task:', task);
                handleTask(task);
                channel.ack(message);
            }
        });
    } catch (error) {
        console.error('Error starting worker:', error);
        throw error;
    }
}

async function handleTask(task) {
    await new Promise(r => setTimeout(r, 10000));

    const { filePath, language, exercise, userId } = task;

    let parameters, results;
    if (exercise === '1') {
        parameters = runParametersSum;
        results = resultSum;
    } else if (exercise === '2') {
        parameters = runParametersDivision;
        results = resultDivision;
    } else {
        console.error('Invalid exercise number:', exercise);
        return;
    }

    const totalTests = parameters.length;

    let resultsPromises = parameters.map((params, index) => {
        return buildAndRunCommand(language, filePath, params).then(stdout => {
            const output = parseInt(stdout.trim());
            if (output === results[index]) {
                console.log(`Output matches expected result for parameters ${params}: ${output}`);
                return 1;
            } else {
                console.error(`Output does not match expected result for parameters ${params}. Expected: ${results[index]}, Got: ${output}`);
                return 0;
            }
        }).catch(error => {
            console.error('Error executing task:', error);
            return 0;
        });
    });

    Promise.all(resultsPromises).then(allResults => {
        const nbrRightResult = allResults.reduce((acc, curr) => acc + curr, 0);
        const percentageCorrect = ((nbrRightResult / totalTests) * 100).toFixed(0);

        console.log(`Percentage of correct results: ${percentageCorrect}%`);

        pool.query('SELECT grade FROM grades WHERE user_id = $1 AND exercise = $2 AND language = $3 ORDER BY grade DESC LIMIT 1', [userId, exercise, language])
            .then(dbRes => {
                if (dbRes.rows.length > 0 && dbRes.rows[0].grade >= percentageCorrect) {
                    console.log('Existing grade is better or equal. No update needed.');
                } else {
                    pool.query('INSERT INTO grades(user_id, grade, exercise, language) VALUES($1, $2, $3, $4) ON CONFLICT (user_id, exercise, language) DO UPDATE SET grade = EXCLUDED.grade', [userId, percentageCorrect, exercise, language])
                        .then(() => console.log('Grade updated successfully'))
                        .catch(dbError => console.error('Error updating grade in database', dbError));
                }
            })
            .catch(dbError => console.error('Error querying existing grades', dbError));

        if (fs.existsSync(filePath)) {
            fs.unlink(filePath, unlinkError => {
                if (unlinkError) {
                    console.error('Error removing source file:', unlinkError);
                } else {
                    console.log(`Source file ${filePath} removed successfully.`);
                }
            });
        }
    }).catch(err => {
        console.error('Error processing results:', err);
    });
}

function buildAndRunCommand(language, filePath, parameters) {
    return new Promise((resolve, reject) => {
        let command;
        if (language === 'Python') {
            command = `python3 ${filePath} ${parameters.join(' ')}`;
        } else if (language === 'C') {
            const output = path.join(path.dirname(filePath), path.parse(filePath).name);
            const compileCommand = `gcc "${filePath}" -o "${output}"`;
            try {
                require('child_process').execSync(compileCommand);
                command = `./${output} ${parameters.join(' ')}`;
            } catch (compileError) {
                console.error('Compilation error:', compileError);
                return reject(`Compilation failed: ${compileError}`);
            }
        }

        const process = require('child_process').exec(command, (error, stdout, stderr) => {
            if (error) {
                if (!process.killed) {
                    console.error('Execution error:', stderr);
                    reject(`Execution failed: ${stderr}`);
                }
            } else {
                resolve(stdout);
            }
        });

        setTimeout(() => {
            if (process.exitCode === null) {
                process.kill();
                console.log(`Process for ${command} terminated due to timeout.`);
                reject('Execution timed out. Grade set to 0.');
            }
        }, 10000);
    });
}



startWorker();
