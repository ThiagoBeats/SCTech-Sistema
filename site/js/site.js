// SCTech — site institucional
(function () {
    'use strict';

    // ===== CONTATO (dados FALSOS por enquanto: troque aqui antes de publicar) =====
    const CONTATO = {
        whatsapp: '5511900000000',              // DDI + DDD + numero, so digitos
        whatsappTexto: '(11) 90000-0000',
        email: 'contato@exemplo.com.br'         // recebe os pedidos de demonstracao (FormSubmit)
    };

    const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const $ = (s, el) => (el || document).querySelector(s);
    const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

    function linkWhats(texto) {
        return 'https://wa.me/' + CONTATO.whatsapp + (texto ? '?text=' + encodeURIComponent(texto) : '');
    }

    // ---------- Contatos no rodape e botao flutuante ----------
    $$('[data-whatsapp]').forEach(a => {
        a.href = linkWhats('Olá! Quero saber mais sobre o SCTech.');
        a.target = '_blank';
        a.rel = 'noopener';
    });
    $$('[data-whatsapp-texto]').forEach(s => { s.textContent = CONTATO.whatsappTexto; });
    $$('[data-email]').forEach(a => { a.href = 'mailto:' + CONTATO.email; });
    $$('[data-email-texto]').forEach(s => { s.textContent = CONTATO.email; });
    const ano = $('#ano');
    if (ano) ano.textContent = new Date().getFullYear();

    // ---------- Topo: fica branco ao rolar ----------
    const topo = $('#topo');
    const aoRolar = () => topo.classList.toggle('rolado', window.scrollY > 40);
    aoRolar();
    window.addEventListener('scroll', aoRolar, { passive: true });

    // menu do celular fecha ao escolher um item
    const menu = $('#menu');
    $$('#menu a').forEach(a => a.addEventListener('click', () => {
        if (menu.classList.contains('show') && window.bootstrap) bootstrap.Collapse.getOrCreateInstance(menu).hide();
    }));
    // no celular o menu aberto precisa do topo branco
    menu.addEventListener('show.bs.collapse', () => topo.classList.add('rolado'));
    menu.addEventListener('hidden.bs.collapse', aoRolar);

    // link do menu da secao visivel
    const links = $$('.topo .nav-link[href^="#"]');
    const secoes = links.map(a => $(a.getAttribute('href'))).filter(Boolean);
    if ('IntersectionObserver' in window) {
        const obsMenu = new IntersectionObserver(entradas => {
            entradas.forEach(e => {
                if (!e.isIntersecting) return;
                links.forEach(a => a.classList.toggle('ativo', a.getAttribute('href') === '#' + e.target.id));
            });
        }, { rootMargin: '-45% 0px -50% 0px' });
        secoes.forEach(s => obsMenu.observe(s));
    }

    // ---------- Hero ----------
    if (window.Swiper) {
        new Swiper('.hero-slider', {
            loop: true,
            effect: 'fade',
            fadeEffect: { crossFade: true },
            speed: reduzMovimento ? 0 : 1000,
            autoplay: reduzMovimento ? false : { delay: 6500, disableOnInteraction: false, pauseOnMouseEnter: true },
            pagination: { el: '.hero-slider .swiper-pagination', clickable: true },
            navigation: { prevEl: '.hero-seta-ant', nextEl: '.hero-seta-prox' },
            keyboard: { enabled: true, onlyInViewport: true },
            a11y: { prevSlideMessage: 'Slide anterior', nextSlideMessage: 'Próximo slide', paginationBulletMessage: 'Ir para o slide {{index}}' }
        });
    } else {
        // sem a biblioteca: mostra o primeiro slide parado
        const primeiro = $('.hero-slider .swiper-slide');
        if (primeiro) primeiro.classList.add('swiper-slide-active');
        $$('.hero-slider .swiper-slide').slice(1).forEach(s => { s.style.display = 'none'; });
    }

    // ---------- Animacoes de entrada ----------
    if (window.AOS && !reduzMovimento) {
        AOS.init({ duration: 800, easing: 'ease-out-cubic', once: true, offset: 80 });
    } else {
        document.documentElement.classList.add('sem-animacao');
        $$('[data-aos]').forEach(el => el.removeAttribute('data-aos'));
    }

    // ---------- Fita metrica: desenrola ao aparecer ----------
    const fita = $('#fita');
    if (fita) {
        if (reduzMovimento || !('IntersectionObserver' in window)) fita.classList.add('aberta');
        else {
            const obsFita = new IntersectionObserver(entradas => {
                if (entradas[0].isIntersecting) { fita.classList.add('aberta'); obsFita.disconnect(); }
            }, { threshold: .35 });
            obsFita.observe(fita);
        }
    }

    // ---------- Vitrine de modulos ----------
    const TELAS = {
        kanban: {
            titulo: 'Painel de produção',
            endereco: 'sctech / produção',
            descricao: 'Todos os pedidos em colunas, da medição fina à instalação. Veja o vendedor, a data de entrega e quantos volumes já foram conferidos, sem abrir pedido por pedido.',
            itens: ['Kanban ou lista, com busca por cliente e tecido', 'Agenda de medições e de instalações', 'Pedido atrasado aparece antes de virar problema'],
            alt: 'Tela do painel de produção do SCTech com pedidos em colunas por etapa'
        },
        painel: {
            titulo: 'Painel de acompanhamento',
            endereco: 'sctech / início',
            descricao: 'O resumo do ateliê assim que você entra: faturamento, pedidos em produção, orçamentos abertos e o que precisa da sua atenção hoje.',
            itens: ['Alerta de tecido abaixo do estoque mínimo', 'Entregas atrasadas e valores a receber', 'Próximas instalações da semana'],
            alt: 'Tela inicial do SCTech com indicadores, alertas de estoque e agenda de instalações'
        },
        estoque: {
            titulo: 'Estoque por metro',
            endereco: 'sctech / estoque',
            descricao: 'Cada rolo com seu código de banho, metragem e custo. O corte do pedido baixa a metragem e o sistema avisa quando um tecido fica abaixo do mínimo.',
            itens: ['Tecidos, materiais e kits no mesmo lugar', 'Entrada de rolo com preço de custo e margem', 'Balanço de estoque e consulta rápida'],
            alt: 'Tela de estoque do SCTech com tecidos, metragem disponível e alerta de estoque mínimo'
        },
        etiquetas: {
            titulo: 'Etiquetas do seu jeito',
            endereco: 'sctech / configurar empresa',
            descricao: 'Monte a etiqueta dos volumes arrastando os campos: cliente, endereço, data de entrega, volume, código de barras e QR Code. Escolha o tamanho da sua impressora térmica.',
            itens: ['100 × 50, 100 × 100, 60 × 40 mm ou tamanho livre', 'Aviso quando o código fica pequeno para o leitor', 'Número escrito embaixo das barras para digitar'],
            alt: 'Editor de etiquetas do SCTech com uma etiqueta de pedido de 100 x 50 mm'
        },
        expedicao: {
            titulo: 'Expedição conferida',
            endereco: 'sctech / expedição',
            descricao: 'O conferente bipa o pedido impresso e depois cada pacote. Pacote de outro pedido, repetido ou com etiqueta antiga dá alerta na hora — com som.',
            itens: ['Funciona com leitor USB ou digitando o código', 'Conferência registrada na linha do tempo do pedido', 'Imprima ou reimprima etiquetas ali mesmo'],
            alt: 'Tela de expedição do SCTech conferindo os volumes de um pedido'
        }
    };
    const vitrine = $('.vitrine');
    if (vitrine) {
        const abas = $$('.vitrine-aba', vitrine);
        const corpo = $('#vitrine-painel');
        const img = $('#vitrine-imagem');
        // pre-carrega as telas para a troca nao piscar
        Object.keys(TELAS).forEach(k => { const i = new Image(); i.src = 'assets/img/telas/' + k + '.webp'; });

        function mostrar(aba) {
            const t = TELAS[aba.dataset.tela];
            if (!t || aba.classList.contains('ativa')) return;
            abas.forEach(a => {
                const ativa = a === aba;
                a.classList.toggle('ativa', ativa);
                a.setAttribute('aria-selected', ativa ? 'true' : 'false');
                a.tabIndex = ativa ? 0 : -1;
            });
            corpo.setAttribute('aria-labelledby', aba.id);
            const aplicar = () => {
                $('#vitrine-titulo').textContent = t.titulo;
                $('#vitrine-descricao').textContent = t.descricao;
                $('#vitrine-endereco').textContent = t.endereco;
                $('#vitrine-itens').innerHTML = t.itens.map(i => '<li>' + i + '</li>').join('');
                img.src = 'assets/img/telas/' + aba.dataset.tela + '.webp';
                img.alt = t.alt;
                vitrine.classList.remove('vitrine-trocando');
            };
            if (reduzMovimento) { aplicar(); return; }
            vitrine.classList.add('vitrine-trocando');
            setTimeout(aplicar, 300);
        }
        abas.forEach((a, i) => {
            a.tabIndex = i === 0 ? 0 : -1;
            a.addEventListener('click', () => mostrar(a));
            a.addEventListener('keydown', ev => {
                const passo = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
                if (!passo) return;
                ev.preventDefault();
                const prox = abas[(i + passo + abas.length) % abas.length];
                prox.focus();
                mostrar(prox);
            });
        });
    }

    // ---------- Formulario de demonstracao ----------
    const form = $('#form-demo');
    if (form) {
        const resultado = $('#f-resultado');
        const botao = $('#f-enviar');
        const digitos = v => String(v || '').replace(/\D/g, '');

        // mascara simples de telefone: (11) 90000-0000
        const whats = $('#f-whats');
        whats.addEventListener('input', () => {
            const d = digitos(whats.value).slice(0, 11);
            let v = d;
            if (d.length > 2) v = '(' + d.slice(0, 2) + ') ' + d.slice(2);
            if (d.length > 7) v = '(' + d.slice(0, 2) + ') ' + d.slice(2, d.length - 4) + '-' + d.slice(-4);
            whats.value = v;
        });

        function validar() {
            let ok = true;
            const marcar = (el, valido) => { el.classList.toggle('is-invalid', !valido); if (!valido && ok) el.focus(); ok = ok && valido; };
            marcar($('#f-nome'), $('#f-nome').value.trim().length >= 2);
            marcar($('#f-empresa'), $('#f-empresa').value.trim().length >= 2);
            marcar(whats, digitos(whats.value).length >= 10);
            marcar($('#f-email'), /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test($('#f-email').value.trim()));
            return ok;
        }
        $$('.form-control', form).forEach(el => el.addEventListener('input', () => el.classList.remove('is-invalid')));

        function mensagemWhats(d) {
            return [
                'Olá! Quero agendar uma demonstração do SCTech.',
                '',
                'Nome: ' + d.nome,
                'Empresa: ' + d.empresa,
                d.cidade ? 'Cidade: ' + d.cidade : '',
                d.equipe ? 'Equipe: ' + d.equipe : '',
                d.mensagem ? 'Quero resolver: ' + d.mensagem : ''
            ].filter((l, i) => l !== '' || i === 1).join('\n');
        }

        function mostrarResultado(classe, html) {
            resultado.className = 'formulario-resultado ' + classe;
            resultado.innerHTML = html;
            resultado.hidden = false;
        }

        form.addEventListener('submit', async ev => {
            ev.preventDefault();
            if (!validar()) return;
            const d = Object.fromEntries(new FormData(form).entries());
            const link = linkWhats(mensagemWhats(d));
            // abre o WhatsApp ja, no clique: depois de um await o navegador bloquearia a janela
            const janela = window.open(link, '_blank');
            if (janela) janela.opener = null;

            botao.disabled = true;
            botao.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando…';
            let enviado = false;
            try {
                const resp = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(CONTATO.email), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify(Object.assign({ _subject: 'Pedido de demonstração — ' + d.empresa, _template: 'table' }, d))
                });
                enviado = resp.ok;
            } catch (e) { enviado = false; }

            botao.disabled = false;
            botao.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Pedir demonstração';
            const abrirWhats = '<a href="' + link + '" target="_blank" rel="noopener">abra o WhatsApp</a>';
            if (enviado) {
                form.reset();
                mostrarResultado('ok', '<strong>Pedido recebido!</strong> Vamos entrar em contato para combinar o horário.' +
                    (janela ? ' Se o WhatsApp não abriu, ' + abrirWhats + '.' : ' Para adiantar, ' + abrirWhats + '.'));
            } else {
                mostrarResultado('aviso', '<strong>Não conseguimos enviar por e-mail agora.</strong> Para não perder seu pedido, ' + abrirWhats + ' e envie a mensagem que já deixamos pronta.');
            }
        });
    }
})();
