Node.js: cordova-builder
========================

Abstract
--------

corova-builder is designed for build systems.  You'll need Cordova, the Android SDK and XCode already installed.  Essentially, the program takes a config file and crunches things to do what Cordova has you do interactively.  I tend to prefer working with html/js using Sublime & Chrome, and then build the app when I've got things working as desired.  I can then use the emulators to work through any plugin issues.

Dealing with all of the required icons & splash screens is a pain, so I've built that into cordova-builder so it can be done automatically using a few source reference images.

Requirements
------------

install imagemagick (for image processing support)

    linux: `apt-get install imagemagick`

    OSX `brew install imagemagick`

    note: imagemagick can be tempermental.  If you recieve errors you should check the tubes for ways to fix ('brew doctor' for OSX works very well).

Installation
------------

    npm install -g cordova-builder

Usage
-----

CD to your project folder.  All source files use the cwd as the root.  Build & target-bin folders also do so by default, but can also be changed if desired.

To create a new project file:

    cordova-builder -n

This will create a file called "cordova-config.json" in your project folder.  A message will tell you that config files have been created; and to edit and re-run.  If you forget this step you'll get a message that there's no config file.

Edit the config file... then to build:

    cordova-builder

For the most part, changing only a few of the config properties is all you
need.  However, in order to add icons, etc. you'll need more extensive
specifications.  The program will error out immediately on any issue, 
so the process tends to be iterative.  Creating the project with "-n" copies a template of all config options to try and make the process easier.

Config items
------------

Note: using lodash.get() syntax.

    `eg., { app: { preferences: { fullscreen: true }}} is denoted "app.preferences.fullscreen"`

app.name: The official name of your app
app.description: The official description
app.title: Not sure
app.java-name: eg. com.your-company.mobile.app
app.version: 1.0.0
app.build-root-dir: where cordova-builder will place the build files & folders. This defaults to the project folder ('.'), but you can move it to another folder if you wish (I do this since I use Dropbox for dev files).
app.target-bin-dir: where cordova-builder will place the final build files.  This defaults to "cordova-bin" in the project folder.  Note that for iOS you may still need to look in the folder "{build}/{app.name}/platforms/ios" for the xcode project.
app.contents: array of content files | folders to copy to cordova www folder
app.contents-main: generally `index.html`
app.plugins: array of cordova plugins to add to the project
app.platforms: ['ios','android'] - this will end up as an object, with build booleans so you can skip during testing. Note: building on anything other than osx (darwin) will skip iOS builds; and failing to specify ANDROID_HOME in the environment will skip android builds.
app.preferences.fullscreen: mapped to cordova/config.xml
app.preferences.webviewbounce: mapped to cordova/config.xml
app.images.sources.splash: an array of image files to be resized for the various splash screen specs.
app.images.sources.icon: an array of icon files to be resized for the various icon specs.
app.apk-names.signed: what to call the signed apk
app.apk-names.unsigned: what to call the unsigned apk
author.name: mapped to cordova/config.xml
author.web-site: mapped to cordova/config.xml
author.email: mapped to cordova/config.xml

Notes
-----

The app.images section will create approriately sized images for each platform.  It matches source images for resizing to destination sizes by matching the aspect ratio and then the area of the source and destination images.  In general, the larger the source images the better, though including several sizes may result in better resized images.  If you don't specify eithor slpash or icon sources, the default Cordova images will be used.

(Gary Skiba)
