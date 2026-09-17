#!/usr/bin/env python3
"""Build product index.html with BDC Egypt titles/H1/meta (no QServe lead)."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent

PAGES = [
    {
        "dir": "queue-system",
        "canonical": "https://bdcegypt.com/queue-system",
        "title": "نظام انتظار العملاء | BDC Egypt",
        "description": "BDC Egypt — نظام انتظار العملاء في مصر للبنوك والمستشفيات والشركات. اطلب عرض سعر على واتساب.",
        "keywords": "نظام انتظار العملاء,شاشات انتظار العملاء,انظمة انتظار العملاء في مصر,BDC Egypt,جهاز انتظار العملاء,عرض أرقام الانتظار",
        "h1": "نظام انتظار العملاء",
        "lead": "أفضل حلول إدارة الطوابير للبنوك والمستشفيات والشركات",
        "sub": "BDC Egypt",
        "hero": "/photo/queue-system-egypt-bank-real-installation.webp",
        "body": """
<p class="text-xl text-gray-600 leading-relaxed mb-10">حلولاً متكاملة تشمل أجهزة طباعة التذاكر، شاشات انتظار العملاء، وحدات استدعاء، أجهزة كيوسك وأنظمة تقارير تحليلية متقدمة.</p>
<h2 class="text-3xl font-black mb-4 text-gray-900">مكونات نظام انتظار العملاء</h2>
<p class="text-gray-600 mb-8">نظام متكامل من الأجهزة والبرامج. يصدر تذاكر انتظار رقمية بسرعة وكفاءة عالية مع دعم طباعة QR وخيارات متعددة للخدمات. شاشات LED عالية الوضوح تعرض أرقام الانتظار الحالية وبيانات الخدمة بشكل واضح للعملاء.</p>
<h2 class="text-3xl font-black mb-4 text-gray-900">استخدامات نظام انتظار العملاء في مصر</h2>
<p class="text-gray-600 mb-4">يُستخدم النظام في قطاعات متعددة: نظام انتظار البنوك في مصر، نظام انتظار المستشفيات، نظام انتظار الخدمات الحكومية، نظام انتظار شركات الاتصالات، نظام انتظار العيادات، ونظام انتظار في المول.</p>
""",
    },
    {
        "dir": "nurse-call-system",
        "canonical": "https://bdcegypt.com/nurse-call-system",
        "title": "نظام استدعاء الممرضات للمستشفيات | BDC Egypt",
        "description": "BDC Egypt — نظام استدعاء الممرضات للمستشفيات في مصر. اطلب عرض سعر على واتساب.",
        "keywords": "نظام استدعاء الممرضات,جهاز استدعاء الممرضات,انظمة استدعاء الممرضات,BDC Egypt,نظام نداء الممرضات,نظام استدعاء المستشفيات",
        "h1": "نظام استدعاء الممرضات",
        "lead": "نظام للمستشفيات يرفع مستوى الرعاية ويحسن سرعة الاستجابة لحالات المرضى",
        "sub": "BDC Egypt",
        "hero": "/photo/nurse%20call%20systems.jpeg",
        "body": """
<p class="text-xl text-gray-600 leading-relaxed mb-10">يتكون نظام استدعاء الممرضات من عدة مكونات أساسية تعمل معًا لضمان عمل النظام بكفاءة وتقديم الاستجابة السريعة.</p>
<h2 class="text-3xl font-black mb-4 text-gray-900">مكونات نظام استدعاء الممرضات</h2>
<p class="text-gray-600 mb-8">تُركب في غرفة الممرضات، وتعرض إشعارات عند استدعاء المريض.</p>
<h2 class="text-3xl font-black mb-4 text-gray-900">لماذا يعتبر النظام ضروريًا؟</h2>
<p class="text-gray-600 mb-4">في بيئة المستشفيات، كل ثانية مهمة. يساعد نظام استدعاء الممرضات على تقليل زمن الاستجابة وتحسين مستوى الأمان داخل المنشأة الطبية، مما يُقلل من المضاعفات الصحية الناتجة عن التأخر في تقديم المساعدة.</p>
""",
    },
    {
        "dir": "self-service-kiosks",
        "canonical": "https://bdcegypt.com/self-service-kiosks",
        "title": "أجهزة كيوسك وخدمات ذاتية | BDC Egypt",
        "description": "BDC Egypt — أجهزة كيوسك وخدمات ذاتية في مصر. اطلب عرض سعر على واتساب.",
        "keywords": "أجهزة كيوسك,أجهزة الخدمات الذاتية,شاشة تاتش,شاشة لمسية تفاعلية,جهاز دفع ذاتي,BDC Egypt,جهاز كيوسك",
        "h1": "أجهزة الخدمات الذاتية",
        "lead": "حلول شاشات تاتش تفاعلية للدفع الذاتي وطلب الطعام والخدمات البنكية والحكومية",
        "sub": "BDC Egypt",
        "hero": "/photo/self-service-kiosks-egypt-bank-branch.webp",
        "body": """
<p class="text-xl text-gray-600 leading-relaxed mb-10">تعمل هذه الأجهزة على تمكين العملاء من إتمام معاملاتهم وطلب خدماتهم بشكل مستقل دون الحاجة إلى موظف، مما يُقلل وقت الانتظار ويرفع كفاءة الخدمة.</p>
<h2 class="text-3xl font-black mb-4 text-gray-900">أنواع أجهزة الخدمات الذاتية</h2>
<p class="text-gray-600 mb-8">تشكيلة متكاملة تناسب جميع القطاعات: كيوسك أجهزة طلب الطعام، كيوسك الخدمات الحكومية، كيوسك الفنادق والضيافة، كيوسك المعلومات والخرائط، والبنوك والخدمات المالية.</p>
""",
    },
]

WA = "https://api.whatsapp.com/send?phone=201227993999"
ICON = "/photo/qserve-queue-management-system-display.webp"
CSS = "/_next/static/chunks/8bc13000d9dcd7e1.css"
FONT = "/_next/static/media/cairo-s.p.66e7ae93.ttf"


def page_html(p: dict) -> str:
    return f"""<!DOCTYPE html>
<html lang="ar" dir="rtl" style="scroll-behavior:smooth">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<link rel="preload" href="{FONT}" as="font" crossorigin="" type="font/ttf"/>
<link rel="stylesheet" href="{CSS}"/>
<title>{p['title']}</title>
<meta name="description" content="{p['description']}"/>
<meta name="keywords" content="{p['keywords']}"/>
<meta name="robots" content="index, follow"/>
<link rel="canonical" href="{p['canonical']}"/>
<link rel="icon" href="{ICON}"/>
<link rel="apple-touch-icon" href="{ICON}"/>
</head>
<body class="cairo_be0f3a3e-module__dEANOq__className antialiased">
<div class="min-h-screen bg-white" dir="rtl">
<header class="bg-white/90 backdrop-blur-md shadow-sm border-b border-gray-100 sticky top-0 z-50">
<div class="container mx-auto px-4 py-3">
<div class="flex items-center justify-between">
<nav class="hidden md:flex items-center bg-gray-100 rounded-full px-2 py-1.5 gap-1">
<a class="text-xs font-medium px-4 py-2 rounded-full text-gray-600 hover:bg-white hover:text-red-600 hover:shadow-sm transition-all" href="/">الرئيسية</a>
<a class="text-xs font-medium px-4 py-2 rounded-full text-gray-600 hover:bg-white hover:text-red-600 hover:shadow-sm transition-all" href="/queue-system/">نظام الانتظار</a>
<a class="text-xs font-medium px-4 py-2 rounded-full text-gray-600 hover:bg-white hover:text-red-600 hover:shadow-sm transition-all" href="/nurse-call-system/">استدعاء الممرضات</a>
<a class="text-xs font-medium px-4 py-2 rounded-full text-gray-600 hover:bg-white hover:text-red-600 hover:shadow-sm transition-all" href="/self-service-kiosks/">الخدمات الذاتية</a>
</nav>
<a href="{WA}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full hover:bg-red-700 transition-all shadow-md text-xs font-bold">تواصل معنا للحصول على عرض سعر</a>
</div>
</div>
</header>
<main>
<section class="relative min-h-[360px] flex items-center justify-center overflow-hidden">
<div class="absolute inset-0 z-0"><img alt="" class="object-cover" style="position:absolute;height:100%;width:100%;left:0;top:0;object-fit:cover" src="{p['hero']}"/></div>
<div class="absolute inset-0 bg-black/75 z-0"></div>
<div class="relative z-10 container mx-auto px-4 text-center text-white py-16">
<h1 class="text-4xl md:text-6xl font-black mb-6 text-balance drop-shadow-xl tracking-tight">{p['h1']}</h1>
<p class="text-xl md:text-2xl mb-4 max-w-3xl mx-auto font-medium text-gray-200">{p['lead']}</p>
<p class="text-lg text-gray-300">{p['sub']}</p>
</div>
</section>
<section class="py-16 bg-white">
<div class="container mx-auto px-4 max-w-4xl">
{p['body']}
<p class="mt-10"><a href="{WA}" target="_blank" rel="noopener noreferrer" class="inline-block bg-red-600 text-white px-8 py-3 rounded-full font-bold hover:bg-red-700">تواصل معنا الآن للحصول على عرض سعر</a></p>
</div>
</section>
<section class="pb-16 bg-white">
<div class="container mx-auto px-4 max-w-4xl">
<h2 class="text-2xl font-bold mb-4 text-gray-900">معلومات التواصل</h2>
<p class="text-gray-600" dir="ltr">+20 122 799 3999</p>
<p><a class="text-gray-600 hover:text-red-600" href="mailto:info@bdcegypt.com">info@bdcegypt.com</a></p>
<p class="text-gray-600">المنطقة الصناعية - منطقة 1000 مصنع, التجمع الثالث, القاهرة الجديدة, القاهرة</p>
</div>
</section>
</main>
<footer class="bg-black text-white py-12">
<div class="container mx-auto px-4">
<div class="grid md:grid-cols-3 gap-8 mb-8">
<div>
<h3 class="text-2xl font-bold mb-4 text-red-600">لماذا BDC Egypt؟</h3>
<ul class="list-disc text-gray-400">
<li>حلول مصممة خصيصًا للسوق المصري</li>
<li>خبرة في أنظمة انتظار العملاء وشاشات الانتظار</li>
<li>دعم فني وتركيب احترافي</li>
</ul>
</div>
<div>
<h4 class="text-xl font-bold mb-4">روابط سريعة</h4>
<ul class="space-y-2 text-gray-400">
<li><a class="hover:text-red-600" href="/">الرئيسية</a></li>
<li><a class="hover:text-red-600" href="/queue-system/">نظام الانتظار</a></li>
<li><a class="hover:text-red-600" href="/nurse-call-system/">استدعاء الممرضات</a></li>
<li><a class="hover:text-red-600" href="/self-service-kiosks/">الخدمات الذاتية</a></li>
</ul>
</div>
<div>
<h4 class="text-xl font-bold mb-4">ساعات العمل</h4>
<p class="text-gray-400">السبت - الخميس: 9:00 صباحاً - 6:00 مساءً<br/>الجمعة: عطلة</p>
</div>
</div>
<p class="border-t border-gray-800 pt-8 text-center text-gray-400">© 2026 BDC Egypt جميع الحقوق محفوظة.</p>
</div>
</footer>
</div>
</body>
</html>
"""


def main() -> None:
    for p in PAGES:
        dest = ROOT / p["dir"] / "index.html"
        dest.write_text(page_html(p), encoding="utf-8")
        print("wrote", dest)


if __name__ == "__main__":
    main()
