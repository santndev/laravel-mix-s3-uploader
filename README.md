# Install
```cmd
npm install laravel-mix-s3-uploader
```
# Configuration
```javascript
if (mix.inProduction()) {
    mix.webpackConfig({
        plugins: [
            new S3Uploader({
                key: process.env.AWS_ACCESS_KEY_ID,
                secret: process.env.AWS_SECRET_ACCESS_KEY,
                bucket: process.env.AWS_BUCKET,
                region: process.env.AWS_REGION,
                sessionToken: process.env.AWS_ACCESS_TOKEN, //optional
                source: 'public', 
                prefix: 'someplace-else/public',  //optional
                acl: 'public-read', //optional
                cache: 'max-age=602430', //optional
                includes: ['public/assets/included'], //optional
                excludes: ['public/assets/excluded'] //optional
            })
        ]
    });
}
```
