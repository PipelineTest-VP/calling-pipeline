const core = require('@actions/core');
const shell = require('shelljs');
const fs = require('fs');
const { Octokit } = require("@octokit/rest");

const xml2js = require('xml2js');

const parser = new xml2js.Parser({
    explicitArray: false
});
const builder = new xml2js.Builder();

let octokit;

async function main() {
    try {
        const orgName = core.getInput('gthub-org-name');
        const gthubUsername = core.getInput('gthub-username');
        const gthubToken = core.getInput('gthub-token');
        const gthubUser = core.getInput('gthub-user');
        const gthubUserEmail = core.getInput('gthub-user-email');
        const dependencyRepoName = core.getInput('dependency-repo-name') || "dependency-details";
        const chilePipelineRepoName = core.getInput('child-pipeline-repo-name') || "child-pipeline";

        octokit = new Octokit({ auth: gthubToken });

        const ev = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
        console.log("ev values: ", ev);
        console.log("process env: ", process.env);

        await shell.mkdir('-p', 'temp');
        await shell.cd('temp');

        const dependencyRepoURL = `https://${gthubUsername}:${gthubToken}@github.com/${orgName}/${dependencyRepoName}.git`
        await shell.exec(`git clone ${dependencyRepoURL}`);

        if(fs.existsSync(`../package.json`)) {
            let nodeDeltaDependencies = [];

            const existingNodeDependencies = JSON.parse(fs.readFileSync(`./${dependencyRepoName}/node_dependencies.json`, 'utf8'));

            const packageJson = JSON.parse(fs.readFileSync(`../package.json`, 'utf8'));
            
            const repoDependcies = getNodeRepoDependencies(packageJson);
            console.log("package json repoDependcies : ", repoDependcies);

            for(let loopVar = 0; loopVar < repoDependcies.length; loopVar++) {
                const repoDependcy = repoDependcies[loopVar];
                const existingNodeDependency = existingNodeDependencies.find(x => x.name === repoDependcy.name);
                if(existingNodeDependency) {
                    if(existingNodeDependency.version !== repoDependcy.version) {
                        nodeDeltaDependencies.push(repoDependcy);
                    }
                } else {
                    nodeDeltaDependencies.push(repoDependcy);
                }
            }

            console.log("nodeDeltaDependencies: ", JSON.stringify(nodeDeltaDependencies));

            /*nodeDeltaDependencies.forEach(x => {
                const ev = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
                console.log("ev: ", ev);
                const prNum = ev.pull_request.number;

                await octokit.request('POST /repos/{owner}/{repo}/dispatches', {
                    owner: orgName,
                    repo: chilePipelineRepoName,
                    event_type: 'snow-request',
                    client_payload: {
                        AppName: "Sample App",
                        AppCMDBID: "CMDB12345678",
                        RequestorName: gthubUser,
                        ProjectName: "",
                        Service_req_number: "",
                        Message: "",
                        PackageRegistry: "",
                        PackageName: x.name,
                        DockerImageName: "",
                        GroupId: "",
                        ArtifactId: "",
                        VersionNumber: "",
                        Platform: ""
                    }
                });
            });*/
        }

        if(fs.existsSync(`../pom.xml`)) {
            let mavenDeltaDependencies = [];

            const existingMavenDependencies = JSON.parse(fs.readFileSync(`./${dependencyRepoName}/maven_dependencies.json`, 'utf8'));

            const pomXml = fs.readFileSync(`../pom.xml`, 'utf8');
            const jsonFromXml = await parser.parseStringPromise(pomXml);
            console.log("jsonFromXml : ", jsonFromXml);

            
            let repoDependcies;
            if(jsonFromXml.project.dependencies && jsonFromXml.project.dependencies.dependency) {
                repoDependcies = jsonFromXml.project.dependencies.dependency;
            } else if(jsonFromXml.project.dependencyManagement && jsonFromXml.project.dependencyManagement.dependencies && jsonFromXml.project.dependencyManagement.dependencies.dependency) {
                repoDependcies = jsonFromXml.project.dependencyManagement.dependencies.dependency;
            }
            console.log("pom xml repoDependcies : ", repoDependcies);

            if(Array.isArray(repoDependcies)) {
                for(let loopVar = 0; loopVar < repoDependcies.length; loopVar++) {
                    const repoDependcy = repoDependcies[loopVar];
                    const existingMavenDependency = existingMavenDependencies.find(x => x.groupId === repoDependcy.groupId && x.artifactId === repoDependcy.artifactId);
                    if(existingMavenDependency) {
                        if(existingMavenDependency.version && repoDependcy.version && existingMavenDependency.version !== repoDependcy.version) {
                            mavenDeltaDependencies.push(repoDependcy);
                        }
                    } else {
                        mavenDeltaDependencies.push(repoDependcy);
                    }
                }
                
            } else {
                if(repoDependcies) {
                    mavenDeltaDependencies.push(repoDependcies);
                }
            }
            console.log("mavenDeltaDependencies: ", JSON.stringify(mavenDeltaDependencies));
        }

        await shell.cd('..');
        await shell.rm('-rf', 'temp');
    } catch (error) {
        console.log(error);
    }
}

function getNodeRepoDependencies(packageJson) {
    let dependencies = [];
    if(packageJson.dependencies) {
        for(let key in packageJson.dependencies) {
            dependencies.push({
                name: key,
                version: packageJson.dependencies[key]
            });
        }
    }

    if(packageJson.devDependencies) {
        for(let key in packageJson.devDependencies) {
            dependencies.push({
                name: key,
                version: packageJson.devDependencies[key]
            });
        }
    }
    
    return dependencies;
}

main();
