const path = require('path')
const { Octokit } = require('@octokit/rest');

const config = require(path.resolve(process.cwd(), 'github.json'));

const github = new Octokit({
    auth: config.auth,
    userAgent: config.userAgent,
});

github.config = config;
github.cRepo = {
    owner: github.config.username,
    repo: github.config.repo,
};

module.exports = github;