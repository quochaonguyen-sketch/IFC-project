
(function(){
  function openLocationTools(){
    var modal = document.getElementById('locationToolsModalBackdrop');
    var frame = document.getElementById('locationToolsFrame');
    if(frame){
      var nextSrc = '/location_tools.html?v=VNWL_V1_3_UPLOAD_4COL_' + Date.now();
      // Luôn nạp bản mới để tránh iframe giữ code cũ làm nút không click được sau deploy.
      frame.src = nextSrc;
      frame.style.pointerEvents = 'auto';
    }
    if(modal){ modal.classList.add('show'); modal.style.pointerEvents='auto'; }
  }
  function closeLocationTools(){
    var modal = document.getElementById('locationToolsModalBackdrop');
    if(modal){ modal.classList.remove('show'); }
    // Quota guard: iframe cong cu upload co Firebase context rieng; dong modal thi ngat context an.
    var frame = document.getElementById('locationToolsFrame');
    if(frame){ frame.src = 'about:blank'; }
  }
  window.openLocationTools = openLocationTools;
  window.ifcOnReady(function(){
    var btn = document.getElementById('btnOpenLocationTools');
    if(btn) btn.addEventListener('click', openLocationTools);
    var close = document.getElementById('btnCloseLocationTools');
    if(close) close.addEventListener('click', closeLocationTools);
    var backdrop = document.getElementById('locationToolsModalBackdrop');
    if(backdrop){
      backdrop.addEventListener('click', function(e){ if(e.target === backdrop) closeLocationTools(); });
    }
  });
})();
