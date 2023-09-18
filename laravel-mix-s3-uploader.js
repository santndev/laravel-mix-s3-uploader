const { S3, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require('fs');
const { SingleBar } = require('cli-progress');
const mime = require('mime-types');
const path = require('path');

let s3;
let bar;

/**
 * Create an instance of LaravelMixS3Uploader.
 * @param {object} options - Configuration options.
 */
function LaravelMixS3Uploader(options) {
    this.bucket = options.bucket;
    this.filesToUpload = [];

    if (!options.region) {
        options.region = 'us-east-1';
    }

    if (options.source) {
        this.source = this.removeSlashes(options.source);
    }

    if (options.prefix) {
        this.prefix = this.removeSlashes(options.prefix);
    }

    if (options.includes) {
        this.includes = options.includes;
    }

    if (options.excludes) {
        this.excludes = options.excludes;
    }

    if (options.sessionToken) {
        this.sessionToken = options.sessionToken;
    }

    if (options.quiet) {
        this.quiet = options.quiet
    }

    if (options.key && options.secret && (options.region || options.endpoint)) {
        const config = {
            accessKeyId: options.key,
            secretAccessKey: options.secret
        }

        if (options.region) {
            config.region = options.region
        }

        if (options.endpoint) {
            config.endpoint = options.endpoint
        }

        if (options.sessionToken) {
            config.credentials = {
                accessKeyId: options.key,
                secretAccessKey: options.secret,
                sessionToken: options.sessionToken
            }
        }

        s3 = new S3(config);
    }

    if (options.remove) {
        this.removePaths(options.remove)
    }

    if (options.acl) {
        this.acl = options.acl
    }

    if (options.cache) {
        this.cache = options.cache
    }
}

/**
 * Remove specified paths from the S3 bucket.
 * @param {string[]} paths - Paths to remove.
 */
LaravelMixS3Uploader.prototype.removePaths = async function (paths) {
    const params = {
        Bucket: this.bucket,
        Delete: {
            Objects: [],
            Quiet: false
        }
    };

    for (const path of paths) {
        params.Delete.Objects.push({
            Key: path,
        });
    }

    try {
        await s3.deleteObjects(params).promise();
    } catch (err) {
        console.error('Error deleting objects:', err);
    }
};

/**
 * Remove trailing slashes from a string.
 * @param {string} str - Input string.
 * @returns {string} - String with trailing slashes removed.
 */
LaravelMixS3Uploader.prototype.removeSlashes = function (str) {
    return str.replace(/^\/|\/$/g, '');
};

/**
 * Upload a file to the S3 bucket.
 * @param {string} filename - Name of the file in the bucket.
 * @param {Buffer} content - File content as a Buffer.
 * @returns {Promise} - Promise resolved after the upload is complete.
 */
LaravelMixS3Uploader.prototype.upload = function (filename, content) {
    return new Promise(async (resolve, reject) => {
        const params = {
            Bucket: this.bucket,
            Key: filename,
            Body: content
        };

        if (this.acl) {
            params.ACL = this.acl;
        }

        if (this.cache) {
            params.CacheControl = this.cache;
        }

        const contentType = mime.lookup(filename);
        if (contentType) {
            params.ContentType = contentType;
        }

        try {
            const command = new PutObjectCommand(params);
            const result = await s3.send(command);
            // Check the results to determine if the upload was successful.
            if (result && result.$metadata.httpStatusCode === 200) {
                resolve();
            } else {
                reject('Error uploading ' + filename + ' to ' + this.bucket + ': Unknown error');
            }
        } catch (err) {
            console.error('Error uploading ' + filename + ' to ' + this.bucket + ': ' + err.name + ' - ' + err.message);
            reject(err);
        }
    });
};

/**
 * Check if a file is excluded based on the provided list of excludes.
 * @param {string} filename - Name of the file to check.
 * @returns {boolean} - True if the file is excluded, otherwise false.
 */
LaravelMixS3Uploader.prototype.isExcluded = function (filename) {
    if (this.excludes && this.excludes.length > 0) {
        for (let exclude of this.excludes) {
            exclude = exclude.replace(/\\/g, '/');
            filename = filename.replace(/\\/g, '/');
            if (filename.startsWith(exclude)) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Check if a file should be uploaded based on includes and excludes.
 * @param {string} filename - Name of the file to check.
 * @returns {boolean} - True if the file should be uploaded, otherwise false.
 */
LaravelMixS3Uploader.prototype.shouldUpload = function (filename) {
    return !this.isExcluded(filename);
}

/**
 * Get a list of files to include in the upload.
 * @param {string[]} dirs - Directories to search for files.
 * @returns {string[]} - List of files to include.
 */
LaravelMixS3Uploader.prototype.getIncludes = function (dirs) {
    const files = [];
    const self = this;

    function traverse(currentPath) {
        const items = fs.readdirSync(currentPath);

        items.forEach(function (item) {
            let itemPath = self.removeSlashes(path.join(currentPath, item));
            const isDirectory = fs.statSync(itemPath).isDirectory();
            if(self.shouldUpload(itemPath)){
                if (isDirectory) {
                    traverse(itemPath);
                } else {
                    if (itemPath.startsWith(self.source)) {
                        itemPath = itemPath.slice(self.source.length + 1); //remove included "/"
                    }
                    if (self.shouldUpload(itemPath)) {
                        itemPath = itemPath.replace(/\\/g, '/');
                        files.push(itemPath);
                    }
                }
            }
        });
    }

    dirs.forEach(function (dir) {
        traverse(dir);
    })

    return files;
}

/**
 * Log a message to the console if not in quiet mode.
 * @param {string} message - Message to log.
 */
LaravelMixS3Uploader.prototype.log = function (message) {
    if (!this.quiet) {
        console.log(message)
    }
}

/**
 * Apply the LaravelMixS3Uploader plugin to a Webpack compiler.
 * @param {object} compiler - Webpack compiler.
 */
LaravelMixS3Uploader.prototype.apply = function (compiler) {
    compiler.hooks.emit.tapAsync("LaravelMixS3Uploader", async (compilation, callback) => {
        for (const filename in compilation.filesToUpload) {
            if (this.shouldUpload(filename)) {
                this.filesToUpload.push(filename);
            }
        }

        if (this.includes) {
            this.filesToUpload = this.filesToUpload.concat(this.getIncludes(this.includes))
        }

        callback();
    });

    compiler.hooks.afterEmit.tapAsync("LaravelMixS3Uploader", async (compilation, cb) => {
        this.log('\r\n\r\nUploading ' + this.filesToUpload.length + ' assets to \'' + this.bucket + '\'...')

        bar = new SingleBar({
            format: 'Progress | {bar} | {percentage}% | {filename}',
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            hideCursor: true
        });

        bar.start(this.filesToUpload.length, 0, {
            filename: "Starting..."
        });

        let c = 1;
        let error = false;

        for (const asset of this.filesToUpload) {
            // Remove the question mark.
            // (added by laravel-mix for some assets)
            let filename = asset.split('?')[0];

            filename = this.removeSlashes(filename)

            let localPath = compiler.outputPath + '/' + filename;
            let remotePath = filename;

            if (this.prefix) {
                remotePath = this.prefix + '/' + remotePath;
            } else if (this.source) {
                remotePath = this.source + '/' + remotePath;
            }

            await this.upload(remotePath, fs.readFileSync(localPath)).catch(e => {
                error = e
                cb(e)
            });

            if (error) {
                return;
            }

            bar.update(c, { filename });
            c++;
        }

        bar.stop();

        this.log('Finished!');
        cb();
    });
};

module.exports = LaravelMixS3Uploader;
