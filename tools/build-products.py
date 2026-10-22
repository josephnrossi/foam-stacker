"""Builds products.js from the Gilman Brothers catalog (tools/catalog-source.json, from the gilmanbrothers.com review).
Names, taglines, descriptions, colours and gauges are copied verbatim; only the in-game look + trait is authored here."""
import json, os
here = os.path.dirname(__file__)
cat = json.load(open(os.path.join(here, 'catalog-source.json')))
W, K, KR = '#f6f7f9', '#24252b', '#c49a6c'
LOOK = {  # face/core variants follow each product's catalog colour list; t = edge thickness in px (from a listed gauge)
 'infinity':        dict(gauge='3/16"', t=15, gloss=1, variants=[[W,'#eef0f3'],[K,'#2c2d33'],[K,'#eef0f3'],[W,'#2c2d33']]),
 'eaglecell':       dict(gauge='1/2"',  t=26, pattern='honeycomb', variants=[[W,KR],[W,'#ece9e2']]),
 'insite-reveal':   dict(gauge='3/16"', t=15, variants=[[W,'#f1f1ec'],[K,'#f1f1ec']]),
 'ryno-board':      dict(gauge='1/2"',  t=22, liner=3, variants=[[W,'#e9ebee']]),
 'insite-colors':   dict(gauge='3/16"', t=15, variants=[['#e63946','#f1f1ec'],['#1f7ae0','#f1f1ec'],['#ffd23f','#f1f1ec'],['#2bb673','#f1f1ec'],['#ff7a1a','#f1f1ec'],['#8e5bd9','#f1f1ec']]),
 'insite-canvas':   dict(gauge='3/16"', t=15, pattern='canvas', variants=[[W,'#f1f1ec']]),
 'gilco-styrene':   dict(gauge='.080"', t=8, solid=1, variants=[['#f9faf7','#f3f4f0']]),
 'insite-ha':       dict(gauge='3/16"', t=15, backing='#d8b25a', variants=[[W,'#f1f1ec'],[K,'#f1f1ec']]),
 'insite-psa':      dict(gauge='3/16"', t=15, backingVariants=['#3fae5a','#1b1b1f'], variants=[[W,'#f1f1ec'],[K,'#f1f1ec']]),
 'insite-acid-free':dict(gauge='3/16"', t=15, variants=[['#f4efe0','#f1f1ec']]),
 'mountcor':        dict(gauge='3/16"', t=15, backing='#cfd8e3', pattern='grid', variants=[[W,'#eef0f3'],[K,'#eef0f3']]),
 'mountcor-canvas': dict(gauge='3/16"', t=15, backing='#cfd8e3', pattern='grid', variants=[[W,'#eef0f3']]),
 'resilient-print': dict(gauge='1/2"',  t=22, velvet=1, variants=[[W,'#17171b']]),
 'resilient-mount': dict(gauge='1/2"',  t=22, velvet=1, variants=[['#1d1d22','#17171b']]),
 'resilient-align': dict(gauge='1/2"',  t=22, velvet=1, variants=[[W,'#17171b']]),
 'adhere':          dict(gauge='0.110"',t=9,  variants=[['#e3e5e8','#d4d7dc']], colorNote='Colour not stated on the site; drawn neutral grey.'),
}
TRAIT = {
 'infinity':        ('clean-cut',  'Clean Cut',       'A trimmed drop keeps your Perfect combo alive.',              'Cuts ~30% quicker on digital cutters such as Zünd'),
 'eaglecell':       ('featherweight','Featherweight', 'Slides 30% slower – easier to place.',                         'Honeycomb core with 95% open space – lightweight'),
 'insite-reveal':   ('rain-shield','Rain Shield',     'Ignores rain and scores double points while it rains.',        'Moisture-resistant clay coating – ink coverage & color gloss'),
 'ryno-board':      ('heavy-duty', 'Heavy Duty',      'Stacks two floors tall, but slides 20% faster.',               'Highest density foam (Gilman line)'),
 'insite-colors':   ('color-pop',  'Color Pop',       '+3 bonus points for colour.',                                  'Polystyrene foam core between two sheets of clay-coated colored paper'),
 'insite-canvas':   ('v-cut-wrap', 'V-Cut Wrap',      'Small trims (10 px or less) wrap over the edge and still count toward your Perfect combo.', 'V-cuts cleanly for bending and gallery wraps'),
 'gilco-styrene':   ('impact',     'Impact Resistant','Miss completely and it bounces back for one retry.',           'Dimensional stability & impact resistance'),
 'insite-ha':       ('heat-bond',  'Heat Bond',       'A Perfect drop doubles the next board\'s Perfect window.',     'Neutral pH HA adhesive'),
 'insite-psa':      ('self-adhesive','Self-Adhesive', 'Overhangs of 14 px or less stick instead of being trimmed.',   'High-Tack or Low-Tack adhesion'),
 'insite-acid-free':('archival',   'Archival',        'A Perfect drop is worth double combo points.',                 'Complies with PAT standards'),
 'mountcor':        ('permanent',  'Permanent Bond',  'A Perfect drop instantly grows the stack back 8 px.',          'Universal permanent adhesion'),
 'mountcor-canvas': ('quick-bond', 'Quick Bond',      'The next 3 boards slide 25% slower.',                          'full tear strength in ~4 minutes in a vacuum press'),
 'resilient-print': ('spring-back','Spring-Back',     'Keeps 25% of the overhang that would have been trimmed.',      'Spring-Back technology'),
 'resilient-mount': ('velvet-black','Velvet Black',   '+5 bonus points for a black board.',                           'Velvet black core'),
 'resilient-align': ('slide-align','Slide to Align',  'Lands within 16 px? It slides into perfect alignment.',        'Slidable, pressure-activated adhesive'),
 'adhere':          ('hang-tight', 'Hang Tight',      'Grows the stack back 10 px when it lands.',                    'Holds up to ½ lb per sq. in. on clean receptive surfaces'),
}
out = []
for p in cat['products']:
  pid = p['id']; L = LOOK[pid]; tid, tname, ttext, basis = TRAIT[pid]
  hay = ' '.join([p['description']] + p['benefits'])
  assert basis in hay, (pid, basis)
  moist = any('oisture' in b for b in p['benefits'])
  assert L['gauge'] in p['gauges']['listed'], (pid, L['gauge'])
  out.append(dict(id=pid, name=p['name'], tagline=p['tagline'], family=p['family'], description=p['description'],
    url=p['url'], colors=p['colors'], gauge=L['gauge'], moistureResistant=moist,
    look={k:v for k,v in L.items() if k!='gauge'}, trait=dict(id=tid, name=tname, text=ttext, basis=basis)))
assert len({o['trait']['id'] for o in out}) == len(out)
js = ('/* Generated by tools/build-products.py from the gilmanbrothers.com catalog – do not edit by hand. */\n'
      'window.FBS_PRODUCTS = ' + json.dumps(out, ensure_ascii=False, indent=1) + ';\n'
      'window.FBS_NOT_IN_GAME = ' + json.dumps(cat.get('notListedInApp', []), ensure_ascii=False) + ';\n')
open(os.path.join(here, '..', 'products.js'), 'w').write(js)
print(len(out), 'products')
for o in out: print(o['name'], '|', o['trait']['name'], '|', o['trait']['text'], '| basis:', o['trait']['basis'], '| moist' if o['moistureResistant'] else '')
