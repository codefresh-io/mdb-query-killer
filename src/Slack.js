const SlackWebhook = require('slack-webhook');

class Slack {
    constructor(slackHookURL) {
        this.slack = new SlackWebhook(slackHookURL);
    }

    send(header, body) {
        let text;
        if (body) {
            text = `*${header}:*\n\`\`\`${JSON.stringify(body)}\`\`\``;
        } else {
            text = header;
        }

        return this.slack.send({ text: text })
            .then(() => {
                console.log("Slack notification has been successfully sent");
            })
            .catch(function (e) {
                console.error(`Couldn't send notification to slack , error : ${e}`);
            });
    }
}

module.exports = Slack;