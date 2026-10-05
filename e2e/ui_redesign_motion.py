#!/usr/bin/env python3
"""Real Chromium pointer/touch and scroll tests for the redesign public surface."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUT=Path('/tmp/opencode/jh-redesign-check'); OUT.mkdir(parents=True,exist_ok=True)
BASE='http://localhost:5174'
checks=[]
def check(name,ok,detail=None):
    checks.append({'name':name,'passed':bool(ok),'detail':detail})
    (OUT/'motion-results.json').write_text(json.dumps(checks,indent=2))
    print(('PASS ' if ok else 'FAIL ')+name,flush=True)
    assert ok,name

def drag(page,selector):
    node=page.locator(selector); box=node.bounding_box()
    # Hit the visible top portion, avoiding overlapping neighboring layers.
    x,y=box['x']+box['width']*.35,box['y']+box['height']*.55
    page.mouse.move(x,y); page.mouse.down(); page.mouse.move(x+36,y+28,steps=6)
    check(selector+' mouse drag starts',node.get_attribute('aria-grabbed')=='true')
    check(selector+' follows pointer',node.evaluate("e=>parseFloat(e.style.getPropertyValue('--drag-x'))")>20)
    page.mouse.up(); page.wait_for_timeout(550)
    check(selector+' springs home',node.get_attribute('aria-grabbed')=='false' and node.evaluate("e=>parseFloat(e.style.getPropertyValue('--drag-x'))")==0)

with sync_playwright() as p:
    browser=p.chromium.launch()
    page=browser.new_page(viewport={'width':1440,'height':900},color_scheme='dark')
    page.goto(BASE); page.wait_for_timeout(500)
    # Moving the mouse outside resets the hero's pointer tilt between gestures.
    for name in ['resume','score','insight','match']:
        page.mouse.move(0,0); page.wait_for_timeout(300); drag(page,'.hero-drag--'+name)
    story=page.locator('.landing-story')
    metrics=story.evaluate('e=>({top:e.getBoundingClientRect().top+scrollY,travel:e.offsetHeight-innerHeight})')
    for progress,index in [(0.08,0),(0.47,1),(0.86,2)]:
        page.evaluate('(x)=>scrollTo({top:x,behavior:"instant"})',metrics['top']+metrics['travel']*progress); page.wait_for_timeout(250)
        opacity=page.locator('.story-scene').nth(index).evaluate('e=>Number(getComputedStyle(e).opacity)')
        check('Desktop story scene '+str(index)+' readable',opacity>.95)
        page.screenshot(path=str(OUT/f'story-desktop-{index}.png'))
    drag(page,'.sample-report-drag')
    for progress in [.31,.66]:
        page.evaluate('(x)=>scrollTo({top:x,behavior:"instant"})',metrics['top']+metrics['travel']*progress); page.wait_for_timeout(200)
        values=page.locator('.story-scene').evaluate_all('nodes=>nodes.map(e=>Number(getComputedStyle(e).opacity))')
        check('Desktop crossfade has no blank interval '+str(progress),max(values)>.5,values)
    page.goto(BASE+'/login'); page.wait_for_timeout(300); drag(page,'.auth-preview-drag')
    # Short desktop fallback must show ALL scenes rather than hidden normal-flow sections.
    page.set_viewport_size({'width':1280,'height':650}); page.goto(BASE)
    for index in range(3):
        node=page.locator('.story-scene').nth(index); node.scroll_into_view_if_needed(); page.wait_for_timeout(200)
        check('Short desktop scene '+str(index)+' visible',node.evaluate('e=>Number(getComputedStyle(e).opacity)')>.95)
    page.close()
    for width in [360,390,768]:
        context=browser.new_context(viewport={'width':width,'height':844 if width<500 else 1024},is_mobile=True,has_touch=True,device_scale_factor=1,color_scheme='dark')
        page=context.new_page(); page.goto(BASE); page.wait_for_timeout(500)
        # Actual browser touch input, not dispatchEvent shims.
        cdp=context.new_cdp_session(page)
        def touch(kind,x=0,y=0):
            cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if kind=='touchEnd' else [{'x':x,'y':y,'id':1}]})
        for name in ['resume','score','insight','match']:
            node=page.locator('.hero-drag--'+name)
            bounds=node.locator(':scope > div').bounding_box()
            check(f'{width} {name} resting bounds',bounds['x']>=0 and bounds['x']+bounds['width']<=width)
        node=page.locator('.hero-drag--score'); node.scroll_into_view_if_needed(); page.wait_for_timeout(200)
        box=node.bounding_box(); x,y=box['x']+box['width']*.55,box['y']+box['height']*.5
        touch('touchStart',x,y); touch('touchEnd'); page.wait_for_timeout(80)
        check(f'{width} touch first tap arms',node.get_attribute('data-touch-armed')=='true')
        touch('touchStart',x,y); touch('touchMove',x-40,y+30); page.wait_for_timeout(50)
        check(f'{width} second touch drags',node.get_attribute('aria-grabbed')=='true' and abs(node.evaluate("e=>parseFloat(e.style.getPropertyValue('--drag-x'))"))>20)
        touch('touchEnd'); page.wait_for_timeout(550)
        check(f'{width} touch release returns home',node.get_attribute('aria-grabbed')=='false' and node.evaluate("e=>parseFloat(e.style.getPropertyValue('--drag-x'))")==0)
        # A fresh single swipe over an unarmed card must scroll the real page.
        start=page.evaluate('scrollY'); box=node.bounding_box(); x,y=box['x']+box['width']/2,box['y']+box['height']/2
        touch('touchStart',x,y)
        for delta in [20,40,70,100]: touch('touchMove',x,y-delta); page.wait_for_timeout(30)
        touch('touchEnd'); page.wait_for_timeout(350)
        check(f'{width} normal single swipe scrolls',page.evaluate('scrollY')>start+30)
        for index in range(3):
            node=page.locator('.story-scene').nth(index)
            page.evaluate('(e)=>scrollTo({top:e.getBoundingClientRect().top+scrollY-innerHeight*.12,behavior:"instant"})',node.element_handle())
            page.wait_for_timeout(350)
            check(f'{width} mobile story {index} readable',node.evaluate('e=>Number(getComputedStyle(e).opacity)')>.9)
            page.screenshot(path=str(OUT/f'story-mobile-{width}-{index}.png'))
        gap=page.evaluate("document.querySelector('.final-cta').getBoundingClientRect().top-document.querySelector('.privacy-band').getBoundingClientRect().bottom")
        check(f'{width} closing CTA has no dead spacer',gap<100,gap)
        page.emulate_media(reduced_motion='reduce'); page.reload(); page.wait_for_timeout(200)
        values=page.locator('.story-scene').evaluate_all('nodes=>nodes.map(e=>Number(getComputedStyle(e).opacity))')
        check(f'{width} reduced motion all scenes readable',all(v==1 for v in values),values)
        context.close()
    browser.close()
print(f'Completed {len(checks)} motion checks.',flush=True)
