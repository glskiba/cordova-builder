var gm = require("gm").subClass({imageMagick: true});
var path = require("path");
var fs = require("fs-extra");
var _ = require("lodash");

function Resolve(p) {
    if (p.charAt(0) == "~") p = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'] + p.substr(1);
    return path.resolve(p);
}

function ImageResizer(_config,callback) {
    var me = this;
    me.platform = _config.platform;
    me.quiet = _config.quiet || false;
    me.type = _config.type;
    me.xmlTpl = _config.xmlTpl;
    me.sourceFiles = _config.sources;
    me.targetFiles = _config.targets;
    me.destRoot = _config.destRoot;
    me.sources = [];
    _.extend(me,{
        load: function() {
            var togo = me.sourceFiles.length, loadErrors = 0;
            if (togo) {
                // console.log("    \xbb loading source images",me.platform,me.type);
                _.forEach(me.sourceFiles,function(fn) {
                    var fullPath = Resolve(fn);
                    var i, info = gm(fullPath).size(function(err,size) {
                        var z, em;
                        if (err) {
                            var fx = fs.existsSync(fullPath);
                            if (fx) {
                                console.log("Error loading source image (imagemagick issue?):",fullPath);
                            } else {
                                console.log("Error loading source image - NOT FOUND:",fullPath);

                            }
                            loadErrors++;
                            // me.errs.push(em);
                            // me.errs.push(err);
                        } else {
                            i = fn.lastIndexOf(".");
                            z = {
                                file: fullPath,
                                width: size.width,
                                height: size.height,
                                aspect: size.width / size.height,
                                area: size.width * size.height,
                                xtn: fn.substr(i)
                            };
                            if (!me.quiet) console.log("    + adding source image",me.platform,me.type,fullPath);
                            me.sources.push(z);
                        }
                        if ((--togo)<=0) {
                            if (loadErrors) {
                                callback({ success: false, fatal: true, error: "Errors loading desired images to be processed"} );
                            } else {
                                me.makeTargets();
                            }
                        }
                    })
                });
            } else {
                callback({ success: false, fatal: false, error: 'no sources' });
            }
        },
        closest: function(width,height) {
            var ta = [], aspect = width/height, area = width * height;
            _.forEach(me.sources,function(img) {
                ta.push({
                    ref: img,
                    aspectDiff  : Math.abs(aspect - img.aspect),
                    areaDiff    : Math.abs(area - img.area)
                });
            });
            ta.sort(function(a,b) {
                // sort for sapect diff follwed by area diff
                return (a.aspectDiff - b.aspectDiff) || (a.areaDiff - b.areaDiff);
            });
            return (ta && ta.length && ta[0].ref) || null; // return the top of the sort
        },
        makeTargets: function() {
            function ensureFolder(filePath) {
                var i = filePath.lastIndexOf("/"), p;
                p = filePath.substr(0,i);
                // console.log("ensureFolder:",p);
                fs.ensureDirSync(p);
            }
            var togo = 0, x = [], made = 0;
            function done() {
                var xml;
                togo--;
                // console.log("done." + platform + " " + togo);
                if (togo<=0) {
                    // if (!me.quiet)
                    {
                        console.log("    \xab done making targets for:",me.platform,me.type,made);
                    }
                    if (x.length) {
                        xml = x.join('\n');
                        // console.log("xml." + me.type + "\n",xml);
                    } else {
                        xml = "";
                        // console.log("no xml for",me.type);
                    }
                    callback({ success: true, xml: xml });
                }
            }
            if (!me.quiet) console.log("    \xbb makeTargets",me.platform,me.type,me.targetFiles && me.targetFiles.length);
            if (me.targetFiles && me.targetFiles.length) {
                togo = me.targetFiles.length;
                _.forEach(me.targetFiles,function(sz) {
                    var i, aspect = sz.width / sz.height, rName, wName, src, saveAs, xmlLine;
                    src = me.closest(sz.width,sz.height);
                    saveAs = sz.saveAs.replace("@W",sz.width).replace("@H",sz.height);
                    if (src) {
                        // format the xml
                        xmlLine = me.xmlTpl;
                        if (xmlLine) {
                            _.forOwn({
                                type: me.type,
                                width: sz.width,
                                height: sz.height,
                                saveAs: saveAs
                            },function(value,key) {
                                var k;
                                k = "${" + key + "}";
                                while (xmlLine.indexOf(k)>=0) xmlLine = xmlLine.replace(k,value);
                            });
                            x.push(xmlLine);
                        }
                        // now write the file
                        wName = [ me.destRoot, "/", saveAs ].join('');
                        if (!me.quiet) console.log("        + creating image file:",saveAs);
                        ensureFolder(wName);
                        made++;
                        if (parseInt(aspect * 100,10) == parseInt(src.aspect * 100,10)) {
                            gm(src.file).resize(sz.width,sz.height).write(wName,function(err) { done(); });
                        } else {
                            gm(src.file).resize(sz.width,sz.height,"!").write(wName,function(err) { done(); });
                        }
                    } else {
                        if (!me.quiet) console.log("No source images to size for: " + saveAs);
                        done();
                    }
                });
            } else {
                callback({ success: false, fatal: false, error: 'no targets to create' })
            }
        }
    });
    me.load();
}

module.exports = {
    imageResizer: function(config,callback) {
        new ImageResizer(config,callback);
    }
};
