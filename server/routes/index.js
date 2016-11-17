var express = require( 'express' );
var nodemailer = require( 'nodemailer' );
var sendGridTransport = require( 'nodemailer-sendgrid-transport' );
var moment = require( 'moment' );
var config = require( 'config' );
var jsonfile = require( 'jsonfile' );
var url = require( 'url' );
var mem = require( 'mem' );
var path = require( 'path' );
var util = require( 'util' );
var _ = require( 'lodash' );


var readFileSync = ( ( path ) => { return jsonfile.readFileSync( path ); } );

function readPageMetadata( settings, pageName ) {
    return readFileSync( path.join( settings.views, 'pages', pageName, 'metadata.json' ) );
}


var readPageContent = mem( ( settings, pageName ) => {
    try {
        return readFileSync( path.join( settings.views, 'pages', pageName, 'content.json' ) );
    } catch ( x ) {
        return {};
    }
} );


var webpackManifest = mem( ( settings ) => {
    return readFileSync( path.join( settings.staticDir, 'manifest.json' ) );
} );


var pageMetadata = mem( ( settings, manifest, pageName, pageUrl ) => {
    var defaults = readPageMetadata( settings, 'index' );
    var result = pageName == 'index'
        ? defaults
        : _.defaults( readPageMetadata( settings, pageName ), defaults );

    var pageDefaults = _.pick( result, 'title', 'description' );
    [ 'og', 'twitter' ].forEach( ( card ) => {
        if ( result[card] ) {
            _.defaults( result[card], defaults[card] );
            _.defaults( result[card], pageDefaults );
            result[card].image = url.resolve( pageUrl, manifest[ result[card].image ] );
            if ( 'url' in result[card] )
                result[card].url = pageUrl;
        }
    } );

    return result;
} );


function requestUrl( req ) {
    return url.format( {
        protocol: req.protocol,
        hostname: req.hostname,
        pathname: req.path
    } );
}


function page( pageName, req, res, options ) {
    var settings = req.app.settings;
    var manifest = webpackManifest( settings );
    var pageUrl = requestUrl( req );
    res.render( path.join( 'pages', pageName, 'page' ), _.extend( {
        pageName: pageName,
        pageUrl: pageUrl,
        manifest: _.fromPairs( [ 'css', 'js' ].map( ( x ) => [ x, manifest[ 'main.' + x ] ] ) ),
        metadata: pageMetadata( settings, manifest, pageName, pageUrl )
    }, _.defaults( {}, options || {}, readPageContent( settings, pageName ) ) ) );
}


var router = express.Router();
router.get( '/', page.bind( null, 'index' ) );

var sitemap = require( 'express-sitemap' )( {
    generate: router,
    url: 'nextspark.com',
    cache: 600000,
} );

router.get('/sitemap.xml', function( req, res ) {
    sitemap.XMLtoWeb( res );
} );


// 404
router.use( function( req, res, next ) {
    res.status( 404 );
    page( '404', req, res, { hideSocial: true } );
} );

router.use( function( err, req, res, next ) {
    if ( req.app.get('env') != 'development' ) {
        err = { status: 500, message: 'Internal Error' };
    }
    res.status( err.status || 500 );
    page( 'error', req, res, {
        message: err.message,
        error: err,
        hideSocial: true
    } );
} );

module.exports = router;
