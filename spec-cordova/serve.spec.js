/**
    Licensed to the Apache Software Foundation (ASF) under one
    or more contributor license agreements.  See the NOTICE file
    distributed with this work for additional information
    regarding copyright ownership.  The ASF licenses this file
    to you under the Apache License, Version 2.0 (the
    "License"); you may not use this file except in compliance
    with the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing,
    software distributed under the License is distributed on an
    "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, either express or implied.  See the License for the
    specific language governing permissions and limitations
    under the License.
*/
var cordova = require('../src/cordova/cordova'),
    console = require('console'),
    path = require('path'),
    shell = require('shelljs'),
    fs = require('fs'),
    Q = require('q'),
    util = require('../src/cordova/util'),
    hooker = require('../src/cordova/hooker'),
    tempDir = path.join(__dirname, '..', 'temp'),
    http = require('http'),
    firefoxos_parser = require('../src/cordova/metadata/firefoxos_parser'),
    android_parser = require('../src/cordova/metadata/android_parser'),
    ios_parser = require('../src/cordova/metadata/ios_parser'),
    blackberry_parser = require('../src/cordova/metadata/blackberry10_parser'),
    wp8_parser        = require('../src/cordova/metadata/wp8_parser');

var cwd = process.cwd();

describe('serve command', function() {
    var payloads = {},
        consoleSpy;
    beforeEach(function() {
        // Make a temp directory
        shell.rm('-rf', tempDir);
        shell.mkdir('-p', tempDir);
        consoleSpy = spyOn(console, 'log');
    });
    afterEach(function() {
        process.chdir(cwd);
        process.env.PWD = cwd;
        shell.rm('-rf', tempDir);
    })
    it('should not run outside of a Cordova-based project', function() {
        process.chdir(tempDir);

        expect(function() {
            cordova.serve().then(function(server) {
                expect(server).toBe(null);
                server.close();
            });
        }).toThrow("Current working directory is not a Cordova-based project.");
    });

    describe('`serve`', function() {
        var done = false, failed = false;
        beforeEach(function() {
            done = false;
            failed = false;
        });

        afterEach(function() {
            payloads = {};
        });

        function test_serve(platform, ref, expectedContents, opts) {
            return function() {
                var server;
                runs(function() {
                    cordova.raw.create(tempDir).then(function () {
                        process.chdir(tempDir);
                        process.env.PWD = tempDir;
                        var plats = [];
                        Object.getOwnPropertyNames(payloads).forEach(function(plat) {
                            var d = Q.defer();
                            plats.push(d.promise);
                            cordova.raw.platform('add', plat, {spawnoutput:'ignore'}).then(function () {
                                var dir = path.join(tempDir, 'merges', plat, plat == 'android' ? 'assets' : '');
                                shell.mkdir('-p', dir);
                                // Write testing HTML files into the directory.
                                fs.writeFileSync(path.join(dir, 'test.html'), payloads[plat]);
                                d.resolve();
                            }).catch(function (e) {
                                expect(e).toBeUndefined();
                                failed = true;
                            });
                        });
                        Q.allSettled(plats).then(function () {
                            opts && 'setup' in opts && opts.setup();
                            cordova.serve(opts && 'port' in opts && opts.port).then(function (srv) {
                                server = srv;
                            });
                        }).catch(function (e) {
                            expect(e).toBeUndefined();
                            failed = true;
                        });
                    }).catch(function (e) {
                        expect(e).toBeUndefined();
                        failed = true;
                    });
                });

                waitsFor(function() {
                    return server || failed;
                }, 'the server should start', 1000);

                var done, errorCB;
                runs(function() {
                    if (failed) {
                        return;
                    }
                    expect(server).toBeDefined();
                    errorCB = jasmine.createSpy();
                    http.get({
                        host: 'localhost',
                        port: opts && 'port' in opts ? opts.port : 8000,
                        path: '/' + platform + '/www' + ref,
                        connection: 'Close'
                    }).on('response', function(res) {
                        var response = '';
                        res.on('data', function(data) {
                            response += data;
                        });
                        res.on('end', function() {
                            expect(res.statusCode).toEqual(200);
                            expect(response).toEqual(expectedContents);
                            done = true;
                        });
                    }).on('error', errorCB);
                });

                waitsFor(function() {
                    return done || failed;
                }, 'the HTTP request should complete', 1000);

                runs(function() {
                    if (!failed) {
                        expect(done).toBeTruthy();
                        expect(errorCB).not.toHaveBeenCalled();
                    }
                    opts && 'cleanup' in opts && opts.cleanup();
                    server && server.close();
                });
            };
        };

        it('should serve from top-level www if the file exists there', function() {
            var payload = 'This is test file.';
            payloads.firefoxos = 'This is the firefoxos test file.'
            test_serve('firefoxos', '/basictest.html', payload, {
                setup: function (){
                    fs.writeFileSync(path.join(util.projectWww(tempDir), 'basictest.html'), payload);
                }
            })();
        });

        it('should honour a custom port setting', function() {
            var payload = 'This is test file.';
            payloads.firefoxos = 'This is the firefoxos test file.'
            test_serve('firefoxos', '/basictest.html', payload, {
                port: 9001,
                setup: function (){
                    fs.writeFileSync(path.join(util.projectWww(tempDir), 'basictest.html'), payload);
                }
            })();
        });

        it('should fall back to assets/www on Android', function() {
            payloads.android = 'This is the Android test file.';
            test_serve('android', '/test.html', payloads.android)();
        });

        it('should fall back to www on iOS', function() {
            payloads.ios = 'This is the iOS test file.';
            test_serve('ios', '/test.html', payloads.ios)();
        });

        it('should fall back to www on firefoxos', function() {
            payloads.firefoxos = 'This is the firefoxos test file.';
            test_serve('firefoxos', '/test.html', payloads.firefoxos)();
        });
    });
});

