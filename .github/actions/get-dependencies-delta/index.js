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
        const dependencyRepoName = core.getInput('dependency-repo-name') || "dependency-details";
        const childPipelineRepoName = core.getInput('child-pipeline-repo-name') || "child-pipeline";

        octokit = new Octokit({ auth: gthubToken });

        await shell.mkdir('-p', 'temp');
        await shell.cd('temp');

        const dependencyRepoURL = `https://${gthubUsername}:${gthubToken}@github.com/${orgName}/${dependencyRepoName}.git`
        await shell.exec(`git clone ${dependencyRepoURL}`);
        
        let srNum = 1;
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

            for(let loopVar = 0; loopVar < nodeDeltaDependencies.length; loopVar++) {
                const x = nodeDeltaDependencies[loopVar];
                await octokit.request('POST /repos/{owner}/{repo}/dispatches', {
                    owner: orgName,
                    repo: childPipelineRepoName,
                    event_type: 'snow-request',
                    client_payload: {
                        ApplicationDetails: {
                            AppName: "Sample NPM App",
                            AppCMDBID: "CMDB12345678",
                            ProjectName: "Sample NPM Project"
                        },
                        DependencyDetails: {
                            PackageRegistry: "NPM",
                            PackageName: x.name,
                            DockerImageName: "",
                            GroupId: "",
                            ArtifactId: "",
                            VersionNumber: x.version
                        },
                        RequestorName: process.env.GITHUB_ACTOR,
                        Service_req_number: srNum,
                        Message: "Test Message NPM",
                        Platform: ""
                    }
                });

                srNum++;
            }
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
                    
                    let dependencyMatches = false;
                    for(let loopVarExisting = 0; loopVarExisting < existingMavenDependencies.length; loopVarExisting++) {
                        const existingMavenDependency = existingMavenDependencies[loopVarExisting];
                        if(existingMavenDependency.groupId === repoDependcy.groupId && existingMavenDependency.artifactId === repoDependcy.artifactId) {
                            if(existingMavenDependency.version && repoDependcy.version && existingMavenDependency.version === repoDependcy.version) {
                                dependencyMatches = true;
                                break;
                            }
                        }
                    }

                    if(!dependencyMatches) {
                        mavenDeltaDependencies.push(repoDependcy);
                    }
                }
                
            } else {
                if(repoDependcies) {
                    mavenDeltaDependencies.push(repoDependcies);
                }
            }
            console.log("mavenDeltaDependencies: ", JSON.stringify(mavenDeltaDependencies));
            
            for(let loopVar = 0; loopVar < mavenDeltaDependencies.length; loopVar++) {
                const x = mavenDeltaDependencies[loopVar];
                await octokit.request('POST /repos/{owner}/{repo}/dispatches', {
                    owner: orgName,
                    repo: childPipelineRepoName,
                    event_type: 'snow-request',
                    client_payload: {
                        ApplicationDetails: {
                            AppName: "Sample Maven App",
                            AppCMDBID: "CMDB12345678",
                            ProjectName: "Sample Maven Project"
                        },
                        DependencyDetails: {
                            PackageRegistry: "Maven",
                            PackageName: x.name,
                            DockerImageName: "",
                            GroupId: x.groupId,
                            ArtifactId: x.artifactId,
                            VersionNumber: x.version
                        },
                        RequestorName: process.env.GITHUB_ACTOR,
                        Service_req_number: srNum,
                        Message: "Test Message Maven",
                        Platform: ""
                    }
                });
                
                srNum++;
            }
        }

        await shell.cd('..');
        await shell.rm('-rf', 'temp');
    } catch (error) {
        console.log(error);
        core.setFailed(error.message);
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
