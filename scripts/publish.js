const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs-extra');
const github = require('./core/github.js');

async function publish() {
    const posts = await getPostList();
    const { p } = await inquirer.prompt([{
        name: 'p',
        message: '请选择输出目录：',
        type: 'list',
        choices: posts.map(v => ({ value: v, name: `${v.group} -- ${v.title}` })),
    }])

    const post = {
        ...github.cRepo,
    };
    post.title = p.title;
    post.body = (await fs.readFile(p.path)).toString('utf8');
    await ensureLabels(post.labels);
    const issue = await getIssuesByTitle(post.title)
    if (issue) {
        post.state = 'open';
        post.issue_number = issue.number;
        await github.issues.update(post)
    } else {
        await github.issues.create(post)
    }
    console.log(`[Publish Log] 文章[${post.title}]发送成功`);
}

async function getIssuesByTitle(title, opt = {}) {
    const SIZE = 100;
    const param = {
        ...github.cRepo,
        creator: github.config.username,
        page: 1,
        per_page: SIZE,
        direction: 'desc',
        state: 'all',
        ...opt
    };
    const { data } = await github.issues.listForRepo({
        ...github.cRepo
    });
    const issue = data.find(v => v.title === title);
    if (!issue && data.length === SIZE) {
        return getIssuesByTitle(title, {
            page: param.page + 1
        })
    }
    return issue;
}

async function getPostList() {
    const ROOT = path.resolve(process.cwd(), 'posts');
    const groups = await fs.readdir(ROOT);
    let list = []
    await Promise.all(groups.filter(v => fs.statSync(path.join(ROOT, v)).isDirectory()).map(async group => {
        const files = await fs.readdir(path.join(ROOT, group))
        list = list.concat(files.map(v => {
            const arr = v.split('.')
            arr.pop();
            return {
                path: path.join(ROOT, group, v),
                title: arr.join('.'),
                group,
                mtime: fs.statSync(path.join(ROOT, group, v)).mtime
            }
        }));
    }));
    return list.sort((a, b) => a.group === b.group ? b.mtime - a.mtime : b.group - a.group);
}


function randomColor() {
    const [h, s, l] = [
        Math.random(),
        Math.floor(Math.random() * 0.5 + 0.5),
        Math.floor(Math.random() * 0.2 + 0.5),
    ];
    var r, g, b;
    if (s == 0) {
        r = g = b = l; // achromatic
    } else {
        var hue2rgb = function hue2rgb(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    r = Math.round(r * 255);
    g = Math.round(g * 255);
    b = Math.round(b * 255);
    return '' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);;
}

async function ensureLabels(labels = []) {
    return Promise.all(labels.map(async v => {
        try {
            await github.issues.createLabel({
                ...github.cRepo,
                name: v,
                color: randomColor()
            })
        } catch (error) {
        }
    }));
}


publish();