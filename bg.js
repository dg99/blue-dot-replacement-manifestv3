'use strict';

const FLASH_INTERVAL_MS = 1000;

chrome.tabs.onUpdated.addListener( ( id, changeInfo, changedTab ) =>
{
	// Only inject into pages covered by the extension's host permissions.
	if ( !isSupportedPage( changedTab?.url ) )
	{
		return;
	}

	if ( changedTab.active || !changeInfo.title )
	{
		return;
	}

	console.debug( '[Blue Dot Replacement] Title changed in background tab', {
		tabId: id,
		url: changedTab.url,
	} );
	applyAlert( id, changedTab ).catch( error =>
	{
		console.error( '[Blue Dot Replacement] Could not replace the favicon.', error );
	} );
} );

chrome.tabs.onActivated.addListener( activeInfo =>
{
	function handler() {
		chrome.tabs.get( activeInfo.tabId, tab =>
		{
			if ( chrome.runtime.lastError ) {
				setTimeout( handler, 50 );
				return;
			}

			if ( !isSupportedPage( tab?.url ) )
			{
				return;
			}

			chrome.scripting.executeScript( {
				target: { tabId: activeInfo.tabId },
				func: restoreIcons,
			} ).catch( error => console.error(
				'[Blue Dot Replacement] Could not restore the favicon.', error
			) );
		} );
	}
	handler();
} );

/**
 * @return Promise
 */
function getSettings()
{
	return new Promise( resolve => chrome.storage.sync.get( {
		listType      : 'enable',
		listEntries   : '',
		applyTo       : 'allTabs',
		alternateIcon : '',
		flashIcon     : 'enable',
	}, resolve ) );
}

async function applyAlert( tabId, tab )
{
	const settings = await getSettings();
	const alertIcon = settings.alternateIcon?.trim() || chrome.runtime.getURL( 'img/alarm.png' );

	if ( ! ( settings.applyTo === 'allTabs'
		|| ( settings.applyTo === 'pinnedOnly' && tab.pinned )
		|| ( settings.applyTo === 'unpinnedOnly' && !tab.pinned ) ) )
	{
		return;
	}

	const entries = settings.listEntries.trim().split( /\s*\n\s*/ ).filter( Boolean );
	const urlIsAMatch = entries.some( entry => tab.url.startsWith( entry ) );
	if ( entries.length && ! ( ( settings.listType === 'enable' && urlIsAMatch )
		|| ( settings.listType === 'disable' && !urlIsAMatch ) ) )
	{
		return;
	}

	await chrome.scripting.executeScript( {
		target: { tabId },
		func: replaceIcons,
		args: [ alertIcon, settings.flashIcon !== 'disable', FLASH_INTERVAL_MS ],
	} );
	console.debug( '[Blue Dot Replacement] Favicon replacement injected.', { tabId } );
}

function replaceIcons( alertIcon, shouldFlash, intervalMs )
{
	document.querySelectorAll( 'link[rel*="icon"]' ).forEach( icon =>
	{
		if ( icon.dataset.blueDotReplacementOriginalHref )
		{
			return;
		}

		icon.dataset.blueDotReplacementOriginalHref = icon.href;
		icon.href = alertIcon;
		if ( shouldFlash )
		{
			let showingOriginal = false;
			icon.blueDotReplacementInterval = setInterval( () =>
			{
				icon.href = showingOriginal ? icon.dataset.blueDotReplacementOriginalHref : alertIcon;
				showingOriginal = !showingOriginal;
			}, intervalMs );
		}
	} );
}

function restoreIcons()
{
	document.querySelectorAll( 'link[rel*="icon"]' ).forEach( icon =>
	{
		const originalHref = icon.dataset.blueDotReplacementOriginalHref;
		if ( !originalHref )
		{
			return;
		}

		icon.href = originalHref;
		delete icon.dataset.blueDotReplacementOriginalHref;
		if ( icon.blueDotReplacementInterval )
		{
			clearInterval( icon.blueDotReplacementInterval );
			delete icon.blueDotReplacementInterval;
		}
	} );
}

function isSupportedPage( url )
{
	return /^https?:\/\//.test( url || '' );
}
