"use strict";
var path = require( "path");
var child = require( "child_process");
var fs = require( "fs-extra");
var program = require("commander");
var _ = require("lodash");
var imgProc = require("./cordova-images");

program
  // .version(packageConfig.version)
  .option("-n, --new", "Create new project")
  // .option("-v, --version", "Display version info",false)
  // .option("-t, --test", "Build test version only")
  // .option("-q, --quiet", "Quiet mode - No prompts")
  .parse(process.argv);

var appConfig;
var builderRoot = path.normalize(__dirname + '/..');
var tplDir = builderRoot + '/templates';

var buildRootName = "__CORDOVA_BUILDER__";
var projectDir = process.cwd();
var packageConfig = JSON.parse(fs.readFileSync(__dirname + '/../package.json'));
var _buildOS = process.platform;
var _platformEnvironment,appName;

var buildDir,targetBinDir,appBuildDir,appEnv;
var buildSteps = [],platformResults = {};

function Resolve(p) {
    if (p.charAt(0) == "~") p = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'] + p.substr(1);
    return path.resolve(p);
}

function info() {
    var ss = Array.prototype.slice.call(arguments, 0).join(' ');
    console.log("    \xbb",ss);
}

function showResults() {
    showStep("Results");
    console.log(JSON.stringify(platformResults,false,2));
}

function nextStep() {
    var s;
    if (buildSteps.length) {
        s = buildSteps.splice(0,1)[0];
        s();
    } else {
        showStep("Build Complete");
        showResults();
        process.exit(0);
    }
}

function configItem(pth,def) {
    return applyMacros(_.get(appConfig,pth,def));
}

function showStep() {
    var ss = "",i,z;
    for (i=0;i<arguments.length;i++) {
        z = arguments[i];
        if (typeof z == "object") z = JSON.stringify(z);
        ss += (i?" ":"") + z;
    }
    console.log("----------------------------------------------------------------------------------------\n// ",ss);
}
function fatal() {
    var ss = Array.prototype.slice.call(arguments, 0).join(' ');
    if (_.trim(ss)) console.log(ss);
    showResults();
    process.exit(-1);
}

function process_config() {
    var config = {},i,file,c,noMain = false,newProject = false;
    var defaultConfigFile = tplDir + '/default-cordova-config.json';
    var defaultConfigText = fs.readFileSync(defaultConfigFile,{encoding: 'utf8'})
    var files = [ "./cordova-config.json", tplDir + '/default-cordova-config.json' ];
    // start with defaults, end with app
    for (i=files.length-1;i>=0;i--) {
        file = files[i];
        c = loader(file);
        if (c) {
            _.merge(config,c);
        } else if (!i) {
            noMain = true;
        }
    }
    if (noMain || program.new) {
        if (program.new && files.length) {
            newProject = true;
            fs.writeFileSync(files[0],defaultConfigText); // JSON.stringify(config,false,4));
            fatal("*** New project created (cordova-config.json) -- edit & re-run");
        } else {
            console.log("*** No project file (try --new)");
            program.help();
        }
    }
    appConfig = config;
    appName = _.get(appConfig,"app.name","");
    if (!appName) fatal("no app.name");
    info("app.name:",appName);
    info("app.version:",_.get(appConfig,"app.version","?"));

    buildDir     = Resolve(_.get(appConfig,"app.build.root-dir",".") + "/" + buildRootName);
    targetBinDir = Resolve(_.get(appConfig,"app.build.target-bin-dir","./cordova-bin"));
    // info("BUILD FOLDER",buildDir);
    // info("TARGET BIN FOLDER",targetBinDir);

    nextStep();
    //------------------------------------
    function loader(f) {
        var contents, cfg;
        try {
            contents = fs.readFileSync(f,{encoding: 'utf8'});
        } catch (e) {
            return false;
        }
        try {
            cfg = JSON.parse(contents);
        } catch (e) {
            fatal("JSON error in config file",f,e);
        }
        return cfg;
    }
}

function process_environment() {
    showStep("Checking environment");
    _platformEnvironment = _.extend({},process.env);
    if (appEnv = _.get(appConfig,"environment." + _buildOS,null)) {
        _platformEnvironment = _.extend(_platformEnvironment,appEnv);
    }
    nextStep();
}

function check_android() {
    var pth,changed = false,
        buildIt = buildingPlatform("android"), 
        androidHome = process.env["ANDROID_HOME"];
    if (buildIt) {
        if (androidHome) {
            pth = androidHome + "/tools"
            if (pth) {
                if (pth.indexOf(androidHome)<0) {
                    pth = androidHome + ":" + pth;
                    _platformEnvironment['PATH'] = pth;
                    changed = true;
                }
            }
            if (changed)
                info("Added ANDROID path:",pth);
            else
                info("ANDROID path OK");
        } else {
            info("skipping ANDROID - no ANDROID_HOME env var");
            buildIt = false;
        }
    } else {
        info("ANDROID build NOT requested");
    }
    _.set(platformResults,"android.build",buildIt);
}
function check_ios() {
    var v = buildingPlatform("ios"), m = v ? "will build iOS" : "skipping iOS";
    if (v && _buildOS != 'darwin') {
        m = "SKIP - iOS on non-Mac PLATFORM: " + _buildOS;
        v = false;
    }
    info(m);
    _.set(platformResults,"ios.build",v);
}

function process_platforms() {
    showStep("Processing platforms");
    check_android();
    check_ios();
    nextStep();
}

function initializeBuildFolder() {
    showStep("Initializing build folders");
    info("buildRoot.....:", buildDir);
    info("targetBin.....:", targetBinDir);
    // fatal("check folders");

    fs.ensureDirSync(buildDir);
    fs.emptyDirSync(buildDir);
    fs.ensureDirSync(targetBinDir);
    fs.emptyDirSync(targetBinDir);
    // fatal("check folders");
    nextStep();
}

function runCommand(cmd,args,options) {
    var rc, pz, _info, pIdx, p, pp, env = {}, opts, iSep = "....................................";
    if (!options) options = {};
    opts = _.extend({
        cwd: buildDir,
        env: _platformEnvironment
    },options);
    showStep(cmd,args,options);
    pz = child.spawnSync(cmd,args,opts);
    rc = pz.status;
    if (rc === null && pz.error) {
        rc = -1;
        _info = pz.error;
    } else {
        _info = (pz.stderr || "ERROR?").toString() || (pz.stdout || "").toString();
    }
    if (rc) {
        // console.log(JSON.stringify(pz,false,2));
        fatal("ERROR",cmd,args,rc,_info);
    }
    if (_info) {
        info("CMD:",cmd,JSON.stringify(args));
        console.log(iSep + "\n" + _info + iSep);
    }
}

function jarSigner() {
    runCommand("jarsigner",['-verbose','-sigalg','SHA1withRSA','-digestalg','SHA1','-storepass','rfcode','-keystore','"$BASE"/my-release-key.keystore','"$TARGET_CORDOVA"/platforms/android/bin/"$UNSIGNED_APK_NAME"','rfcode']);
}
function zipAlign() {
    runCommand("zipalign",['-v','4','"$TARGET_CORDOVA"/platforms/android/bin/"$UNSIGNED_APK_NAME"','"$TARGET_CORDOVA"/platforms/android/bin/"$SIGNED_APK_NAME"']);
}

function createCordovaProject() {
    runCommand('cordova',['create',appName]);
    appBuildDir = buildDir + "/" + appName;
    nextStep();
}

function applyMacros(source) {
    var dest = source,i,j,idx,key,val,bos,eos,errs = [];
    do {
        j = bos;
        bos = dest.indexOf("${");
        if (bos>=0) {
            eos = dest.substr(bos).indexOf("}");
            if (eos>=0) {
                key = dest.substr(bos+2,eos-2);
                val = _.get(appConfig,key,null);
                if (val === null) {
                    switch (key) {
                        case "BUILDER":
                            val = buildDir;
                        break;
                        default:
                            errs.push(key);
                            val = "";
                    }
                }
                dest = dest.substr(0,bos) + val + dest.substr(bos+eos+1);
            } else {
                fatal("unterminated macro",dest.substr(bos));
            }
        }
    } while (bos>=0 && j != bos);
    if (errs.length) {
        fatal("MACRO expansion -- missing keys: [",errs.join(", "),"]");
    }
    if (bos>=0) fatal("MACRO ERROR",dest.substr(bos));
    // info("MACRO",dest);
    return dest;
}

function createProjectConfigXml() {
    var mx = 5, i=mx, newConfig = "", tpl;
    try {
        tpl = fs.readFileSync(tplDir + '/config.xml',{encoding: 'utf8'});
        // info("tpl source",tpl)
        newConfig = applyMacros(tpl);
        if (newConfig.indexOf("${")>=0) {
            fatal("config.xml macro expansion -- not all macros were expanded (${})");
        }
        fs.writeFileSync(appBuildDir + '/config.xml',newConfig);
    } catch (e) {
        fatal("Error creating project config.xml from template",e);
    }
    nextStep();
}

function copyContents() {
    var destFolder = buildDir + "/" + appName + "/www/",contents = _.get(appConfig,"app.contents",[]);
    if (!_.isArray(contents)) contents = [ contents ];
    showStep("Copying project webview contents:",contents);
    if (!contents.length) fatal("No contents to copy -- need at least one (index.html?)")
    _.forEach(contents,function(c) {
        info(c);
        fs.copySync("./" + c,destFolder + "/" + c);
    });
    nextStep();
}
function processPlatformResources(platform) {
    function setDone(t) {
        var i;
        t.done = true;
        // info("resource done",t.args.type)
        for (i=0;i<targets.length;i++){
            if (!targets[i].done) return;
        }
        // all done
        _.set(appConfig,"build.resources." + platform + ".xml",_xml);
        nextStep();
    }
    var targets = [], _xml = "";
    showStep("PlatformResources",platform);
    _.forOwn(_.get(appConfig,"app.resources",{}),function(value,key) {
        var t;
        if (_.isArray(value) && value.length) {
            info(key + ":",value.length,"source file" + (value.length > 1 ? "s" : ""));
            switch(key) {
                case "icon":
                case "splash":
                case "screen":
                case "store":
                    // info("target",key)
                    t = _.get(appConfig,"platforms." + platform + ".resources." + key,[]);
                    if (t && t.length) {
                        targets.push({
                            fn: imgProc.imageResizer,
                            args: {
                                platform: platform,
                                quiet: (!_.get(appConfig,"app.build.verbose",false)),
                                type: key,
                                xmlTpl: _.get(appConfig,"platforms." + platform + ".xml-tpl",""),
                                destRoot: Resolve(configItem("platforms." + platform + ".resource-dest-root",".")),
                                sources: value,
                                targets: t
                            }
                        });
                    }
            }
        } else {
            info(key + ":","skipping (no source files)");
        }
    });
    if (targets.length) {
        _.forEach(targets,function(t) {
            t.fn(t.args,function(results) {
                if (results.success) {
                    _xml += results.xml || "";
                } else {
                    if (results.fatal) {
                        fatal(results.error);
                    }
                }
                setDone(t);
            })
        })
    } else {
        nextStep();
    }
}
function resourceSteps() {
    // poke platform resource functions into the beginning of the steps queue
    // showStep("poking platform resource steps")
    _.forOwn(_.get(appConfig,"platforms",{}),function(value,key) {
        _.set(appConfig,"build.resources." + key + ".xml","");
        // if (value.build)
            buildSteps.splice(0,0,function() { processPlatformResources(key); });
    });
    nextStep();
}

function addPlatform(platform) {
    runCommand('cordova',['platform','add',platform],{ cwd: appBuildDir });
}

function addPlugin(plugin) {
    runCommand('cordova',['plugin','add',plugin],{ cwd: appBuildDir });
}

function buildingPlatform(nm) {
    var requested = _.get(appConfig,"app.platforms." + nm + ".build",false);
    var canBuild = _.get(platformResults,nm + ".build",true);
    // console.log("building?",nm,requested,canBuild);
    return requested && canBuild;
}

function build_android() {
    var args, forRelease = _.get(appConfig,"app.platforms.android.release",false);
    var dest, nm = ["android-",forRelease ? "release" : "debug"].join('');
    runCommand('cordova',['prepare','android'],{ cwd: appBuildDir });
    args = ['compile','android'];
    if (forRelease) args.push("--release");
    runCommand('cordova',args,{ cwd: appBuildDir });

    dest = Resolve(configItem("app.build.target-bin-dir","~/cordova") + "/android");
    fs.emptyDirSync(dest);
    fs.copySync(configItem("platforms.android.artifacts.bin-folder") + "/" + nm + "-unaligned.apk",dest + "/" + nm + "-unaligned.apk");
    fs.copySync(configItem("platforms.android.artifacts.bin-folder") + "/" + nm + ".apk",dest + "/" + nm + ".apk");
    // jarSigner();
    // zipAlign();
}
function build_ios() {
    var args, forRelease = _.get(appConfig,"app.platforms.ios.release",false);
    var oDir = appBuildDir + '/platforms/ios/build/device', xcrArgs;
    var dest,nm;
    // runCommand('cordova',['prepare','ios'],{ cwd: appBuildDir });
    args = ['build','ios'];
    if (forRelease) args.push("--device");
    runCommand('cordova',args,{ cwd: appBuildDir });
    dest = Resolve(configItem("app.build.target-bin-dir","~/cordova") + "/ios");
    fs.emptyDirSync(dest);
    // nm = ["android-",forRelease ? "release" : "debug"].join('');
    // fs.copySync(configItem("platforms.ios.artifacts.bin-folder") + "/" + nm + "-unaligned.apk",dest + "/" + nm + "-unaligned.apk");
    // fs.copySync(configItem("platforms.ios.artifacts.bin-folder") + "/" + nm + ".apk",dest + "/" + nm + ".apk");

    // xcrArgs = [ '-sdk','iphoneos','PackageApplication', oDir + ' ' + appName + '.app', '-o', oDir + ' ' + appName + '.ipa' ];
    // runCommand('/usr/bin/xcrun',xcrArgs,{ cwd: oDir });
}

function buildPlatform(platform) {
    // runCommand('cordova',['prepare',platform],{ cwd: appBuildDir });
    // runCommand('cordova',['compile',platform,'--release'],{ cwd: appBuildDir });
    switch (platform) {
        case "android": build_android(); break;
        case "ios":     build_ios(); break;
    }
}
function cleanup() {
    showStep("Cleaning up");
    nextStep();
}

///////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////

console.log("\n\n");
console.log("=============================================================================================================")
console.log("=== CORDOVA-BUILDER ===");
console.log("=============================================================================================================")
console.log("Current directory [" + projectDir + "]");
console.log("version:",packageConfig.version);
//----------------------------------------------------------
// Setup up async steps
//----------------------------------------------------------
buildSteps.push(process_config);
buildSteps.push(process_environment);
buildSteps.push(process_platforms);
// at this point we're ready to roll
buildSteps.push(initializeBuildFolder);
buildSteps.push(createCordovaProject);
buildSteps.push(function() {
    showStep("Adding platforms");
    _.forOwn(_.get(appConfig,"platforms",{}),function(value,key) {
        if (buildingPlatform(key)) { 
            addPlatform(key);
        }
    });
    nextStep();
});
buildSteps.push(function() {
    showStep("Adding plugins");
    _.forEach(_.get(appConfig,"app.plugins",[]),function(p) { addPlugin(p); });
    nextStep();
});
buildSteps.push(copyContents);
buildSteps.push(resourceSteps);
// buildSteps.push(function() { fatal("DEBUG STOP")});
buildSteps.push(createProjectConfigXml);
//----------------------------------------------------------
buildSteps.push(function() {
    showStep("Building platforms");
    _.forOwn(_.get(appConfig,"platforms",{}),function(value,key) {
        if (buildingPlatform(key)) {
            var pp = platformResults[key];
            pp.started = new Date();
            buildPlatform(key);
            pp.finished = new Date();
            pp.elapsed = (pp.finished.getTime() - pp.started.getTime())/1000;
        }
    });
    nextStep();
});
buildSteps.push(cleanup);
// buildSteps.push(showResults);
//----------------------------------------------------------
nextStep();
