/* Bulk parent logins + printable login slips (Admin only), shown at the top of Student/Parent Logins.
   Create a login for every student of a class in one click (username = student name, starting password you choose,
   default student@123, parents are asked to pick their own password at first sign-in), then print cut-out slips
   (English + Telugu, QR code, install steps) to hand out. Data comes from /api/student-logins/*.
   Includes "qrcode-generator" by Kazuhiko Arase (MIT licence) for the QR code. */
;(function(){
var qrcode=function(){var t=function(t,r){var e=t,n=g[r],o=null,i=0,a=null,u=[],f={},c=function(t,r){o=function(t){for(var r=new Array(t),e=0;e<t;e+=1){r[e]=new Array(t);for(var n=0;n<t;n+=1)r[e][n]=null}return r}(i=4*e+17),l(0,0),l(i-7,0),l(0,i-7),s(),h(),d(t,r),e>=7&&v(t),null==a&&(a=p(e,n,u)),w(a,r)},l=function(t,r){for(var e=-1;e<=7;e+=1)if(!(t+e<=-1||i<=t+e))for(var n=-1;n<=7;n+=1)r+n<=-1||i<=r+n||(o[t+e][r+n]=0<=e&&e<=6&&(0==n||6==n)||0<=n&&n<=6&&(0==e||6==e)||2<=e&&e<=4&&2<=n&&n<=4)},h=function(){for(var t=8;t<i-8;t+=1)null==o[t][6]&&(o[t][6]=t%2==0);for(var r=8;r<i-8;r+=1)null==o[6][r]&&(o[6][r]=r%2==0)},s=function(){for(var t=B.getPatternPosition(e),r=0;r<t.length;r+=1)for(var n=0;n<t.length;n+=1){var i=t[r],a=t[n];if(null==o[i][a])for(var u=-2;u<=2;u+=1)for(var f=-2;f<=2;f+=1)o[i+u][a+f]=-2==u||2==u||-2==f||2==f||0==u&&0==f}},v=function(t){for(var r=B.getBCHTypeNumber(e),n=0;n<18;n+=1){var a=!t&&1==(r>>n&1);o[Math.floor(n/3)][n%3+i-8-3]=a}for(n=0;n<18;n+=1){a=!t&&1==(r>>n&1);o[n%3+i-8-3][Math.floor(n/3)]=a}},d=function(t,r){for(var e=n<<3|r,a=B.getBCHTypeInfo(e),u=0;u<15;u+=1){var f=!t&&1==(a>>u&1);u<6?o[u][8]=f:u<8?o[u+1][8]=f:o[i-15+u][8]=f}for(u=0;u<15;u+=1){f=!t&&1==(a>>u&1);u<8?o[8][i-u-1]=f:u<9?o[8][15-u-1+1]=f:o[8][15-u-1]=f}o[i-8][8]=!t},w=function(t,r){for(var e=-1,n=i-1,a=7,u=0,f=B.getMaskFunction(r),c=i-1;c>0;c-=2)for(6==c&&(c-=1);;){for(var g=0;g<2;g+=1)if(null==o[n][c-g]){var l=!1;u<t.length&&(l=1==(t[u]>>>a&1)),f(n,c-g)&&(l=!l),o[n][c-g]=l,-1==(a-=1)&&(u+=1,a=7)}if((n+=e)<0||i<=n){n-=e,e=-e;break}}},p=function(t,r,e){for(var n=A.getRSBlocks(t,r),o=b(),i=0;i<e.length;i+=1){var a=e[i];o.put(a.getMode(),4),o.put(a.getLength(),B.getLengthInBits(a.getMode(),t)),a.write(o)}var u=0;for(i=0;i<n.length;i+=1)u+=n[i].dataCount;if(o.getLengthInBits()>8*u)throw"code length overflow. ("+o.getLengthInBits()+">"+8*u+")";for(o.getLengthInBits()+4<=8*u&&o.put(0,4);o.getLengthInBits()%8!=0;)o.putBit(!1);for(;!(o.getLengthInBits()>=8*u||(o.put(236,8),o.getLengthInBits()>=8*u));)o.put(17,8);return function(t,r){for(var e=0,n=0,o=0,i=new Array(r.length),a=new Array(r.length),u=0;u<r.length;u+=1){var f=r[u].dataCount,c=r[u].totalCount-f;n=Math.max(n,f),o=Math.max(o,c),i[u]=new Array(f);for(var g=0;g<i[u].length;g+=1)i[u][g]=255&t.getBuffer()[g+e];e+=f;var l=B.getErrorCorrectPolynomial(c),h=k(i[u],l.getLength()-1).mod(l);for(a[u]=new Array(l.getLength()-1),g=0;g<a[u].length;g+=1){var s=g+h.getLength()-a[u].length;a[u][g]=s>=0?h.getAt(s):0}}var v=0;for(g=0;g<r.length;g+=1)v+=r[g].totalCount;var d=new Array(v),w=0;for(g=0;g<n;g+=1)for(u=0;u<r.length;u+=1)g<i[u].length&&(d[w]=i[u][g],w+=1);for(g=0;g<o;g+=1)for(u=0;u<r.length;u+=1)g<a[u].length&&(d[w]=a[u][g],w+=1);return d}(o,n)};f.addData=function(t,r){var e=null;switch(r=r||"Byte"){case"Numeric":e=M(t);break;case"Alphanumeric":e=x(t);break;case"Byte":e=m(t);break;case"Kanji":e=L(t);break;default:throw"mode:"+r}u.push(e),a=null},f.isDark=function(t,r){if(t<0||i<=t||r<0||i<=r)throw t+","+r;return o[t][r]},f.getModuleCount=function(){return i},f.make=function(){if(e<1){for(var t=1;t<40;t++){for(var r=A.getRSBlocks(t,n),o=b(),i=0;i<u.length;i++){var a=u[i];o.put(a.getMode(),4),o.put(a.getLength(),B.getLengthInBits(a.getMode(),t)),a.write(o)}var g=0;for(i=0;i<r.length;i++)g+=r[i].dataCount;if(o.getLengthInBits()<=8*g)break}e=t}c(!1,function(){for(var t=0,r=0,e=0;e<8;e+=1){c(!0,e);var n=B.getLostPoint(f);(0==e||t>n)&&(t=n,r=e)}return r}())},f.createTableTag=function(t,r){t=t||2;var e="";e+='<table style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: "+(r=void 0===r?4*t:r)+"px;",e+='">',e+="<tbody>";for(var n=0;n<f.getModuleCount();n+=1){e+="<tr>";for(var o=0;o<f.getModuleCount();o+=1)e+='<td style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: 0px;",e+=" width: "+t+"px;",e+=" height: "+t+"px;",e+=" background-color: ",e+=f.isDark(n,o)?"#000000":"#ffffff",e+=";",e+='"/>';e+="</tr>"}return e+="</tbody>",e+="</table>"},f.createSvgTag=function(t,r,e,n){var o={};"object"==typeof arguments[0]&&(t=(o=arguments[0]).cellSize,r=o.margin,e=o.alt,n=o.title),t=t||2,r=void 0===r?4*t:r,(e="string"==typeof e?{text:e}:e||{}).text=e.text||null,e.id=e.text?e.id||"qrcode-description":null,(n="string"==typeof n?{text:n}:n||{}).text=n.text||null,n.id=n.text?n.id||"qrcode-title":null;var i,a,u,c,g=f.getModuleCount()*t+2*r,l="";for(c="l"+t+",0 0,"+t+" -"+t+",0 0,-"+t+"z ",l+='<svg version="1.1" xmlns="http://www.w3.org/2000/svg"',l+=o.scalable?"":' width="'+g+'px" height="'+g+'px"',l+=' viewBox="0 0 '+g+" "+g+'" ',l+=' preserveAspectRatio="xMinYMin meet"',l+=n.text||e.text?' role="img" aria-labelledby="'+y([n.id,e.id].join(" ").trim())+'"':"",l+=">",l+=n.text?'<title id="'+y(n.id)+'">'+y(n.text)+"</title>":"",l+=e.text?'<description id="'+y(e.id)+'">'+y(e.text)+"</description>":"",l+='<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>',l+='<path d="',a=0;a<f.getModuleCount();a+=1)for(u=a*t+r,i=0;i<f.getModuleCount();i+=1)f.isDark(a,i)&&(l+="M"+(i*t+r)+","+u+c);return l+='" stroke="transparent" fill="black"/>',l+="</svg>"},f.createDataURL=function(t,r){t=t||2,r=void 0===r?4*t:r;var e=f.getModuleCount()*t+2*r,n=r,o=e-r;return I(e,e,function(r,e){if(n<=r&&r<o&&n<=e&&e<o){var i=Math.floor((r-n)/t),a=Math.floor((e-n)/t);return f.isDark(a,i)?0:1}return 1})},f.createImgTag=function(t,r,e){t=t||2,r=void 0===r?4*t:r;var n=f.getModuleCount()*t+2*r,o="";return o+="<img",o+=' src="',o+=f.createDataURL(t,r),o+='"',o+=' width="',o+=n,o+='"',o+=' height="',o+=n,o+='"',e&&(o+=' alt="',o+=y(e),o+='"'),o+="/>"};var y=function(t){for(var r="",e=0;e<t.length;e+=1){var n=t.charAt(e);switch(n){case"<":r+="&lt;";break;case">":r+="&gt;";break;case"&":r+="&amp;";break;case'"':r+="&quot;";break;default:r+=n}}return r};return f.createASCII=function(t,r){if((t=t||1)<2)return function(t){t=void 0===t?2:t;var r,e,n,o,i,a=1*f.getModuleCount()+2*t,u=t,c=a-t,g={"██":"█","█ ":"▀"," █":"▄","  ":" "},l={"██":"▀","█ ":"▀"," █":" ","  ":" "},h="";for(r=0;r<a;r+=2){for(n=Math.floor((r-u)/1),o=Math.floor((r+1-u)/1),e=0;e<a;e+=1)i="█",u<=e&&e<c&&u<=r&&r<c&&f.isDark(n,Math.floor((e-u)/1))&&(i=" "),u<=e&&e<c&&u<=r+1&&r+1<c&&f.isDark(o,Math.floor((e-u)/1))?i+=" ":i+="█",h+=t<1&&r+1>=c?l[i]:g[i];h+="\n"}return a%2&&t>0?h.substring(0,h.length-a-1)+Array(a+1).join("▀"):h.substring(0,h.length-1)}(r);t-=1,r=void 0===r?2*t:r;var e,n,o,i,a=f.getModuleCount()*t+2*r,u=r,c=a-r,g=Array(t+1).join("██"),l=Array(t+1).join("  "),h="",s="";for(e=0;e<a;e+=1){for(o=Math.floor((e-u)/t),s="",n=0;n<a;n+=1)i=1,u<=n&&n<c&&u<=e&&e<c&&f.isDark(o,Math.floor((n-u)/t))&&(i=0),s+=i?g:l;for(o=0;o<t;o+=1)h+=s+"\n"}return h.substring(0,h.length-1)},f.renderTo2dContext=function(t,r){r=r||2;for(var e=f.getModuleCount(),n=0;n<e;n++)for(var o=0;o<e;o++)t.fillStyle=f.isDark(n,o)?"black":"white",t.fillRect(n*r,o*r,r,r)},f};t.stringToBytes=(t.stringToBytesFuncs={default:function(t){for(var r=[],e=0;e<t.length;e+=1){var n=t.charCodeAt(e);r.push(255&n)}return r}}).default,t.createStringToBytes=function(t,r){var e=function(){for(var e=S(t),n=function(){var t=e.read();if(-1==t)throw"eof";return t},o=0,i={};;){var a=e.read();if(-1==a)break;var u=n(),f=n()<<8|n();i[String.fromCharCode(a<<8|u)]=f,o+=1}if(o!=r)throw o+" != "+r;return i}(),n="?".charCodeAt(0);return function(t){for(var r=[],o=0;o<t.length;o+=1){var i=t.charCodeAt(o);if(i<128)r.push(i);else{var a=e[t.charAt(o)];"number"==typeof a?(255&a)==a?r.push(a):(r.push(a>>>8),r.push(255&a)):r.push(n)}}return r}};var r,e,n,o,i,a=1,u=2,f=4,c=8,g={L:1,M:0,Q:3,H:2},l=0,h=1,s=2,v=3,d=4,w=5,p=6,y=7,B=(r=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],e=1335,n=7973,i=function(t){for(var r=0;0!=t;)r+=1,t>>>=1;return r},(o={}).getBCHTypeInfo=function(t){for(var r=t<<10;i(r)-i(e)>=0;)r^=e<<i(r)-i(e);return 21522^(t<<10|r)},o.getBCHTypeNumber=function(t){for(var r=t<<12;i(r)-i(n)>=0;)r^=n<<i(r)-i(n);return t<<12|r},o.getPatternPosition=function(t){return r[t-1]},o.getMaskFunction=function(t){switch(t){case l:return function(t,r){return(t+r)%2==0};case h:return function(t,r){return t%2==0};case s:return function(t,r){return r%3==0};case v:return function(t,r){return(t+r)%3==0};case d:return function(t,r){return(Math.floor(t/2)+Math.floor(r/3))%2==0};case w:return function(t,r){return t*r%2+t*r%3==0};case p:return function(t,r){return(t*r%2+t*r%3)%2==0};case y:return function(t,r){return(t*r%3+(t+r)%2)%2==0};default:throw"bad maskPattern:"+t}},o.getErrorCorrectPolynomial=function(t){for(var r=k([1],0),e=0;e<t;e+=1)r=r.multiply(k([1,C.gexp(e)],0));return r},o.getLengthInBits=function(t,r){if(1<=r&&r<10)switch(t){case a:return 10;case u:return 9;case f:case c:return 8;default:throw"mode:"+t}else if(r<27)switch(t){case a:return 12;case u:return 11;case f:return 16;case c:return 10;default:throw"mode:"+t}else{if(!(r<41))throw"type:"+r;switch(t){case a:return 14;case u:return 13;case f:return 16;case c:return 12;default:throw"mode:"+t}}},o.getLostPoint=function(t){for(var r=t.getModuleCount(),e=0,n=0;n<r;n+=1)for(var o=0;o<r;o+=1){for(var i=0,a=t.isDark(n,o),u=-1;u<=1;u+=1)if(!(n+u<0||r<=n+u))for(var f=-1;f<=1;f+=1)o+f<0||r<=o+f||0==u&&0==f||a==t.isDark(n+u,o+f)&&(i+=1);i>5&&(e+=3+i-5)}for(n=0;n<r-1;n+=1)for(o=0;o<r-1;o+=1){var c=0;t.isDark(n,o)&&(c+=1),t.isDark(n+1,o)&&(c+=1),t.isDark(n,o+1)&&(c+=1),t.isDark(n+1,o+1)&&(c+=1),0!=c&&4!=c||(e+=3)}for(n=0;n<r;n+=1)for(o=0;o<r-6;o+=1)t.isDark(n,o)&&!t.isDark(n,o+1)&&t.isDark(n,o+2)&&t.isDark(n,o+3)&&t.isDark(n,o+4)&&!t.isDark(n,o+5)&&t.isDark(n,o+6)&&(e+=40);for(o=0;o<r;o+=1)for(n=0;n<r-6;n+=1)t.isDark(n,o)&&!t.isDark(n+1,o)&&t.isDark(n+2,o)&&t.isDark(n+3,o)&&t.isDark(n+4,o)&&!t.isDark(n+5,o)&&t.isDark(n+6,o)&&(e+=40);var g=0;for(o=0;o<r;o+=1)for(n=0;n<r;n+=1)t.isDark(n,o)&&(g+=1);return e+=Math.abs(100*g/r/r-50)/5*10},o),C=function(){for(var t=new Array(256),r=new Array(256),e=0;e<8;e+=1)t[e]=1<<e;for(e=8;e<256;e+=1)t[e]=t[e-4]^t[e-5]^t[e-6]^t[e-8];for(e=0;e<255;e+=1)r[t[e]]=e;var n={glog:function(t){if(t<1)throw"glog("+t+")";return r[t]},gexp:function(r){for(;r<0;)r+=255;for(;r>=256;)r-=255;return t[r]}};return n}();function k(t,r){if(void 0===t.length)throw t.length+"/"+r;var e=function(){for(var e=0;e<t.length&&0==t[e];)e+=1;for(var n=new Array(t.length-e+r),o=0;o<t.length-e;o+=1)n[o]=t[o+e];return n}(),n={getAt:function(t){return e[t]},getLength:function(){return e.length},multiply:function(t){for(var r=new Array(n.getLength()+t.getLength()-1),e=0;e<n.getLength();e+=1)for(var o=0;o<t.getLength();o+=1)r[e+o]^=C.gexp(C.glog(n.getAt(e))+C.glog(t.getAt(o)));return k(r,0)},mod:function(t){if(n.getLength()-t.getLength()<0)return n;for(var r=C.glog(n.getAt(0))-C.glog(t.getAt(0)),e=new Array(n.getLength()),o=0;o<n.getLength();o+=1)e[o]=n.getAt(o);for(o=0;o<t.getLength();o+=1)e[o]^=C.gexp(C.glog(t.getAt(o))+r);return k(e,0).mod(t)}};return n}var A=function(){var t=[[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12,7,37,13],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]],r=function(t,r){var e={};return e.totalCount=t,e.dataCount=r,e},e={};return e.getRSBlocks=function(e,n){var o=function(r,e){switch(e){case g.L:return t[4*(r-1)+0];case g.M:return t[4*(r-1)+1];case g.Q:return t[4*(r-1)+2];case g.H:return t[4*(r-1)+3];default:return}}(e,n);if(void 0===o)throw"bad rs block @ typeNumber:"+e+"/errorCorrectionLevel:"+n;for(var i=o.length/3,a=[],u=0;u<i;u+=1)for(var f=o[3*u+0],c=o[3*u+1],l=o[3*u+2],h=0;h<f;h+=1)a.push(r(c,l));return a},e}(),b=function(){var t=[],r=0,e={getBuffer:function(){return t},getAt:function(r){var e=Math.floor(r/8);return 1==(t[e]>>>7-r%8&1)},put:function(t,r){for(var n=0;n<r;n+=1)e.putBit(1==(t>>>r-n-1&1))},getLengthInBits:function(){return r},putBit:function(e){var n=Math.floor(r/8);t.length<=n&&t.push(0),e&&(t[n]|=128>>>r%8),r+=1}};return e},M=function(t){var r=a,e=t,n={getMode:function(){return r},getLength:function(t){return e.length},write:function(t){for(var r=e,n=0;n+2<r.length;)t.put(o(r.substring(n,n+3)),10),n+=3;n<r.length&&(r.length-n==1?t.put(o(r.substring(n,n+1)),4):r.length-n==2&&t.put(o(r.substring(n,n+2)),7))}},o=function(t){for(var r=0,e=0;e<t.length;e+=1)r=10*r+i(t.charAt(e));return r},i=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);throw"illegal char :"+t};return n},x=function(t){var r=u,e=t,n={getMode:function(){return r},getLength:function(t){return e.length},write:function(t){for(var r=e,n=0;n+1<r.length;)t.put(45*o(r.charAt(n))+o(r.charAt(n+1)),11),n+=2;n<r.length&&t.put(o(r.charAt(n)),6)}},o=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);if("A"<=t&&t<="Z")return t.charCodeAt(0)-"A".charCodeAt(0)+10;switch(t){case" ":return 36;case"$":return 37;case"%":return 38;case"*":return 39;case"+":return 40;case"-":return 41;case".":return 42;case"/":return 43;case":":return 44;default:throw"illegal char :"+t}};return n},m=function(r){var e=f,n=t.stringToBytes(r),o={getMode:function(){return e},getLength:function(t){return n.length},write:function(t){for(var r=0;r<n.length;r+=1)t.put(n[r],8)}};return o},L=function(r){var e=c,n=t.stringToBytesFuncs.SJIS;if(!n)throw"sjis not supported.";!function(){var t=n("友");if(2!=t.length||38726!=(t[0]<<8|t[1]))throw"sjis not supported."}();var o=n(r),i={getMode:function(){return e},getLength:function(t){return~~(o.length/2)},write:function(t){for(var r=o,e=0;e+1<r.length;){var n=(255&r[e])<<8|255&r[e+1];if(33088<=n&&n<=40956)n-=33088;else{if(!(57408<=n&&n<=60351))throw"illegal char at "+(e+1)+"/"+n;n-=49472}n=192*(n>>>8&255)+(255&n),t.put(n,13),e+=2}if(e<r.length)throw"illegal char at "+(e+1)}};return i},D=function(){var t=[],r={writeByte:function(r){t.push(255&r)},writeShort:function(t){r.writeByte(t),r.writeByte(t>>>8)},writeBytes:function(t,e,n){e=e||0,n=n||t.length;for(var o=0;o<n;o+=1)r.writeByte(t[o+e])},writeString:function(t){for(var e=0;e<t.length;e+=1)r.writeByte(t.charCodeAt(e))},toByteArray:function(){return t},toString:function(){var r="";r+="[";for(var e=0;e<t.length;e+=1)e>0&&(r+=","),r+=t[e];return r+="]"}};return r},S=function(t){var r=t,e=0,n=0,o=0,i={read:function(){for(;o<8;){if(e>=r.length){if(0==o)return-1;throw"unexpected end of file./"+o}var t=r.charAt(e);if(e+=1,"="==t)return o=0,-1;t.match(/^\s$/)||(n=n<<6|a(t.charCodeAt(0)),o+=6)}var i=n>>>o-8&255;return o-=8,i}},a=function(t){if(65<=t&&t<=90)return t-65;if(97<=t&&t<=122)return t-97+26;if(48<=t&&t<=57)return t-48+52;if(43==t)return 62;if(47==t)return 63;throw"c:"+t};return i},I=function(t,r,e){for(var n=function(t,r){var e=t,n=r,o=new Array(t*r),i={setPixel:function(t,r,n){o[r*e+t]=n},write:function(t){t.writeString("GIF87a"),t.writeShort(e),t.writeShort(n),t.writeByte(128),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(255),t.writeByte(255),t.writeByte(255),t.writeString(","),t.writeShort(0),t.writeShort(0),t.writeShort(e),t.writeShort(n),t.writeByte(0);var r=a(2);t.writeByte(2);for(var o=0;r.length-o>255;)t.writeByte(255),t.writeBytes(r,o,255),o+=255;t.writeByte(r.length-o),t.writeBytes(r,o,r.length-o),t.writeByte(0),t.writeString(";")}},a=function(t){for(var r=1<<t,e=1+(1<<t),n=t+1,i=u(),a=0;a<r;a+=1)i.add(String.fromCharCode(a));i.add(String.fromCharCode(r)),i.add(String.fromCharCode(e));var f,c,g,l=D(),h=(f=l,c=0,g=0,{write:function(t,r){if(t>>>r!=0)throw"length over";for(;c+r>=8;)f.writeByte(255&(t<<c|g)),r-=8-c,t>>>=8-c,g=0,c=0;g|=t<<c,c+=r},flush:function(){c>0&&f.writeByte(g)}});h.write(r,n);var s=0,v=String.fromCharCode(o[s]);for(s+=1;s<o.length;){var d=String.fromCharCode(o[s]);s+=1,i.contains(v+d)?v+=d:(h.write(i.indexOf(v),n),i.size()<4095&&(i.size()==1<<n&&(n+=1),i.add(v+d)),v=d)}return h.write(i.indexOf(v),n),h.write(e,n),h.flush(),l.toByteArray()},u=function(){var t={},r=0,e={add:function(n){if(e.contains(n))throw"dup key:"+n;t[n]=r,r+=1},size:function(){return r},indexOf:function(r){return t[r]},contains:function(r){return void 0!==t[r]}};return e};return i}(t,r),o=0;o<r;o+=1)for(var i=0;i<t;i+=1)n.setPixel(i,o,e(i,o));var a=D();n.write(a);for(var u=function(){var t=0,r=0,e=0,n="",o={},i=function(t){n+=String.fromCharCode(a(63&t))},a=function(t){if(t<0);else{if(t<26)return 65+t;if(t<52)return t-26+97;if(t<62)return t-52+48;if(62==t)return 43;if(63==t)return 47}throw"n:"+t};return o.writeByte=function(n){for(t=t<<8|255&n,r+=8,e+=1;r>=6;)i(t>>>r-6),r-=6},o.flush=function(){if(r>0&&(i(t<<6-r),t=0,r=0),e%3!=0)for(var o=3-e%3,a=0;a<o;a+=1)n+="="},o.toString=function(){return n},o}(),f=a.toByteArray(),c=0;c<f.length;c+=1)u.writeByte(f[c]);return u.flush(),"data:image/gif;base64,"+u};return t}();qrcode.stringToBytesFuncs["UTF-8"]=function(t){return function(t){for(var r=[],e=0;e<t.length;e++){var n=t.charCodeAt(e);n<128?r.push(n):n<2048?r.push(192|n>>6,128|63&n):n<55296||n>=57344?r.push(224|n>>12,128|n>>6&63,128|63&n):(e++,n=65536+((1023&n)<<10|1023&t.charCodeAt(e)),r.push(240|n>>18,128|n>>12&63,128|n>>6&63,128|63&n))}return r}(t)},function(t){"function"==typeof define&&define.amd?define([],t):"object"==typeof exports&&(module.exports=t())}(function(){return qrcode});;window.__qrcodeGen = qrcode;})();
(function(){
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const num = v => { const m = String(v).match(/\d+/); return m ? parseInt(m[0], 10) : 999; };
  const active = () => (typeof students !== 'undefined' ? students : []).filter(s => typeof isActive === 'function' ? isActive(s) : true);
  const toast = m => { try{ showToast(m); }catch(e){ alert(m); } };
  const S = { cls: '', sec: '', pw: 'student@123', force: true };

  const css = `
  #blkCard{background:#fff;border:1px solid #dde3ee;border-radius:16px;padding:16px 18px;margin:0 0 18px;box-shadow:0 2px 10px rgba(30,40,80,.05)}
  #blkCard h3{margin:0 0 4px;font-size:1.05rem}
  #blkCard .blk-hint{font-size:.8rem;color:#5b6784;margin:0 0 12px}
  #blkCard .blk-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
  #blkCard label.blk-f{display:flex;flex-direction:column;gap:3px;font-size:11px;font-weight:700;color:#5b6784;text-transform:uppercase;letter-spacing:.04em}
  #blkCard select,#blkCard input[type=text]{height:42px;border:1.5px solid #cfd7e6;border-radius:12px;padding:0 10px;font-size:14px;background:#fff;color:#1f2a44;text-transform:none;letter-spacing:0;font-weight:500;min-width:140px}
  #blkCard .blk-chk{display:flex;gap:8px;align-items:center;font-size:.82rem;margin-top:10px;color:#33405c}
  #blkCard .blk-btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
  #blkCard .blk-out{margin-top:12px;font-size:.84rem;line-height:1.5}
  #blkCard .blk-ok{color:#0b7a5a;font-weight:700}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function classes(){ return Array.from(new Set(active().map(s => s.className).filter(Boolean))).sort((a, b) => num(a) - num(b) || String(a).localeCompare(String(b))); }
  function sections(){ return Array.from(new Set(active().filter(s => !S.cls || s.className === S.cls).map(s => s.section).filter(Boolean))).sort(); }
  function opts(list, cur, first){ return '<option value="">' + first + '</option>' + list.map(v => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>').join(''); }

  function draw(card){
    const keepOut = card.querySelector('#blkOut') ? card.querySelector('#blkOut').innerHTML : '';
    card.innerHTML = '<h3>📲 Logins for a whole class</h3>' +
      '<p class="blk-hint">Creates a parent login for every student in the class who does not have one yet. The username is the student’s name; every parent starts with the password below and is asked to choose their own at first sign-in.</p>' +
      '<div class="blk-row">' +
        '<label class="blk-f">Class<select id="blkCls">' + opts(classes(), S.cls, 'Choose class') + '</select></label>' +
        '<label class="blk-f">Section<select id="blkSec">' + opts(sections(), S.sec, 'All sections') + '</select></label>' +
        '<label class="blk-f">Starting password<input type="text" id="blkPw" value="' + esc(S.pw) + '" autocomplete="off"></label>' +
      '</div>' +
      '<label class="blk-chk"><input type="checkbox" id="blkForce"' + (S.force ? ' checked' : '') + '> Ask parents to choose their own password at first sign-in (recommended)</label>' +
      '<div class="blk-btns"><button class="btn btn-primary" id="blkCreate">Create logins</button>' +
      '<button class="btn" id="blkPrint">🖨️ Print login slips</button></div>' +
      '<div class="blk-hint" id="blkPush" style="margin:10px 0 0;"></div>' +
      '<div class="blk-btns" style="margin-top:6px;"><button class="btn" id="blkNotif">🔔 Who has notifications on?</button></div>' +
      '<div class="blk-out" id="blkOut">' + keepOut + '</div>';
    pushLine(card);
    card.querySelector('#blkCls').onchange = e => { S.cls = e.target.value; S.sec = ''; draw(card); preview(card); };
    card.querySelector('#blkSec').onchange = e => { S.sec = e.target.value; preview(card); };
    card.querySelector('#blkPw').oninput = e => { S.pw = e.target.value; };
    card.querySelector('#blkForce').onchange = e => { S.force = e.target.checked; };
    card.querySelector('#blkCreate').onclick = () => create(card);
    card.querySelector('#blkPrint').onclick = () => printSlips(card);
    card.querySelector('#blkNotif').onclick = () => notifStatus(card);
  }
  async function notifStatus(card){
    try{
      const j = await api('GET', '/api/student-logins/push-status?className=' + encodeURIComponent(S.cls) + '&section=' + encodeURIComponent(S.sec));
      const where = S.cls ? (S.cls + (S.sec ? ' ' + S.sec : '')) : 'all classes';
      const off = j.students.filter(x => !x.on);
      let h = '<b>' + j.on + ' of ' + j.total + '</b> parents in ' + esc(where) + ' have notifications on' + (j.total ? ' (' + Math.round(100 * j.on / j.total) + '%)' : '') + '.';
      if(!j.pushConfigured) h += ' <span style="color:#b3261e;">Phone notifications are not set up for this school yet, so nobody can turn them on.</span>';
      if(off.length){
        h += '<div style="margin-top:8px;max-height:220px;overflow:auto;border:1px solid #e1e6f0;border-radius:10px;padding:6px 10px;">' +
          off.map(x => '⚠️ ' + esc(x.name) + ' <span style="color:#5b6784;">· ' + esc(x.className) + ' ' + esc(x.section || '') + (x.admissionNo ? ' · #' + esc(x.admissionNo) : '') + '</span>').join('<br>') + '</div>' +
          '<div class="blk-btns"><button class="btn" id="blkNCopy">Copy list</button><button class="btn" id="blkNPrint">🖨️ Print list</button></div>';
      } else if(j.total){ h += ' <span class="blk-ok">Everyone here is on. 🎉</span>'; }
      out(card, h);
      const txt = 'Parents without notifications (' + where + '):\n' + off.map(x => x.name + ' - ' + x.className + ' ' + (x.section || '')).join('\n');
      const c = card.querySelector('#blkNCopy'); if(c) c.onclick = async () => { try{ await navigator.clipboard.writeText(txt); toast('List copied.'); }catch(e){ toast('Could not copy.'); } };
      const pr = card.querySelector('#blkNPrint'); if(pr) pr.onclick = () => printHtml('<!doctype html><html><head><meta charset="utf-8"><title>Notifications not on</title><style>body{font:14px Arial;padding:20px}li{margin:3px 0}</style></head><body><h3>Parents without notifications — ' + esc(where) + '</h3><ol>' + off.map(x => '<li>' + esc(x.name) + ' — ' + esc(x.className) + ' ' + esc(x.section || '') + '</li>').join('') + '</ol></body></html>');
    }catch(e){ out(card, '<span style="color:#b3261e;">' + esc(e.message) + '</span>'); }
  }
  async function pushLine(card){
    const el = card.querySelector('#blkPush'); if(!el) return;
    try{
      const r = await fetch('/api/push/vapid-key');
      el.innerHTML = r.ok ? '🔔 Phone notifications are <b style="color:#0b7a5a;">switched on</b> for this school. Parents will see a “Turn on notifications” button on their home screen.'
        : '🔔 Phone notifications are <b style="color:#b3261e;">not set up yet</b> for this school, so parents will not be asked to turn them on. (They still see every alert inside the app.)';
    }catch(e){ el.textContent = ''; }
  }
  async function api(method, path, body){
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try{ j = await r.json(); }catch(e){}
    if(!r.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
    return j;
  }
  function out(card, html){ const o = card.querySelector('#blkOut'); if(o) o.innerHTML = html; }
  async function preview(card){
    if(!S.cls){ out(card, ''); return; }
    try{
      const j = await api('POST', '/api/student-logins/bulk', { className: S.cls, section: S.sec, password: S.pw, preview: true });
      out(card, '<b>' + j.needLogin + '</b> of ' + j.students + ' students need a login' + (j.alreadyHave ? ' (' + j.alreadyHave + ' already have one)' : '') + '.');
    }catch(e){ out(card, '<span style="color:#b3261e;">' + esc(e.message) + '</span>'); }
  }
  async function create(card){
    if(!S.cls){ toast('Choose a class first.'); return; }
    let go = true;
    try{ go = await showConfirmDialog('Create parent logins for ' + S.cls + (S.sec ? ' ' + S.sec : ' (all sections)') + '? Starting password: ' + S.pw); }catch(e){}
    if(!go) return;
    const b = card.querySelector('#blkCreate'); b.disabled = true; const t = b.textContent; b.textContent = 'Creating…';
    try{
      const j = await api('POST', '/api/student-logins/bulk', { className: S.cls, section: S.sec, password: S.pw, forceChange: S.force });
      out(card, '<span class="blk-ok">✓ ' + j.created.length + ' login(s) created</span>' + (j.alreadyHave ? ' · ' + j.alreadyHave + ' student(s) already had one' : '') +
        (j.created.length ? '. Now press <b>Print login slips</b> and hand one slip to each parent.' : '.'));
      try{ if(typeof loadUsers === 'function') await loadUsers(); else if(typeof refreshUserListViews === 'function') refreshUserListViews(); }catch(e){}
      try{ users = await (await fetch('/api/users')).json(); if(typeof refreshUserListViews === 'function') refreshUserListViews(); }catch(e){}
    }catch(e){ out(card, '<span style="color:#b3261e;">Could not create: ' + esc(e.message) + '</span>'); }
    b.disabled = false; b.textContent = t;
  }

  /* ---------- slips ---------- */
  const T = {
    en: ['Scan the QR code, or open the link below in Chrome.', 'Tap “Parent”, then type the Username and Password above.', 'The app asks you to choose your own new password. Remember it and keep it private.', 'When the app asks to allow notifications, tap “Allow” to get fee, marks and homework alerts.'],
    te: ['QR కోడ్ స్కాన్ చేయండి లేదా కింద ఉన్న లింక్‌ను Chrome లో తెరవండి.', '“Parent” నొక్కి, పైన ఉన్న యూజర్‌నేమ్, పాస్‌వర్డ్ ఇవ్వండి.', 'యాప్ మీ కొత్త పాస్‌వర్డ్ పెట్టమని అడుగుతుంది. దాన్ని గుర్తుంచుకోండి, ఎవరికీ చెప్పకండి.', 'నోటిఫికేషన్లు అనుమతించమని అడిగితే “Allow” నొక్కండి — ఫీజు, మార్కులు, హోంవర్క్ అలర్ట్‌లు వస్తాయి.']
  };
  function qrSvg(url){
    try{ const q = window.__qrcodeGen(0, 'M'); q.addData(url); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }catch(e){ return ''; }
  }
  function slipHtml(x, school, url, svg){
    return '<div class="slip"><div class="hd"><div class="sc">' + esc(school) + '</div><div class="ti">Parent Login Card · తల్లిదండ్రుల లాగిన్ కార్డ్</div></div>' +
      '<div class="who"><b>' + esc(x.name) + '</b> · ' + esc(x.className) + (x.section ? ' ' + esc(x.section) : '') + (x.admissionNo ? ' · Adm ' + esc(x.admissionNo) : '') + '</div>' +
      '<div class="cred"><div><span>Username</span><b>' + esc(x.username) + '</b></div><div><span>Password</span><b>' + esc(x.password) + '</b></div></div>' +
      '<div class="body"><div class="steps"><ol>' + T.en.map(t => '<li>' + t + '</li>').join('') + '</ol>' +
      '<ol class="te">' + T.te.map(t => '<li>' + t + '</li>').join('') + '</ol></div>' +
      '<div class="qr">' + svg + '<div class="url">' + esc(url.replace(/^https?:\/\//, '')) + '</div></div></div>' +
      '<div class="inst"><div><b>Install on your phone:</b> open in Chrome → tap ⋮ (menu) → <b>Install app</b> (or Add to Home screen).</div><div><b>ఫోన్‌లో ఇన్‌స్టాల్:</b> Chrome లో తెరిచి → ⋮ (మెనూ) నొక్కి → <b>Install app</b> (లేదా Add to Home screen) నొక్కండి.</div></div></div>';
  }
  const slipCss = `@page{size:A4;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,"Nirmala UI","Gautami",sans-serif;margin:0;color:#111}
  .sheet{display:grid;grid-template-columns:1fr 1fr;gap:0;page-break-after:always}.sheet:last-child{page-break-after:auto}
  .slip{border:1px dashed #777;padding:3.5mm 4mm;height:91mm;overflow:hidden;font-size:10pt;line-height:1.32}
  .hd{border-bottom:1.5px solid #211a4e;padding-bottom:1.2mm;margin-bottom:1.5mm}.sc{font-weight:800;font-size:12pt;color:#211a4e}.ti{font-size:8.6pt;color:#444}
  .who{font-size:10.6pt;margin-bottom:2mm}.cred{display:flex;gap:3mm;margin-bottom:1.6mm}.cred div{flex:1;border:1.2px solid #211a4e;border-radius:2mm;padding:1mm 2mm;background:#f6f4ff}
  .cred span{display:block;font-size:6.8pt;color:#555;text-transform:uppercase;letter-spacing:.04em}.cred b{font-size:12.5pt;word-break:break-all;font-family:Consolas,monospace}
  .body{display:flex;gap:2.5mm}.steps{flex:1}.steps ol{margin:0 0 1mm;padding-left:4mm}.steps li{margin-bottom:.4mm}.steps .te{font-size:9.2pt;color:#222;margin-top:1.2mm}
  .qr{width:27mm;text-align:center}.qr svg{width:27mm;height:27mm}.url{font-size:6.6pt;word-break:break-all;margin-top:.6mm}
  .inst{margin-top:1.5mm;border-top:1px dotted #999;padding-top:1.2mm;font-size:8.4pt}.inst div{margin-bottom:.6mm}
  .bar{padding:8px 12px;background:#211a4e;color:#fff;font:14px Arial}@media print{.bar{display:none}}`;
  function printHtml(html){
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(f);
    f.onload = () => { try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){ toast('Could not open the print window.'); } setTimeout(() => f.remove(), 180000); };
    f.srcdoc = html;
  }
  async function printSlips(card){
    if(!S.cls){ toast('Choose a class first (and a section if you want only one).'); return; }
    try{
      const j = await api('GET', '/api/student-logins/slips?className=' + encodeURIComponent(S.cls) + '&section=' + encodeURIComponent(S.sec));
      const list = j.slips || [];
      if(!list.length){ out(card, 'No slips to print: every parent in this selection has already chosen their own password, or no logins exist yet. Use <b>Create logins</b> first.'); return; }
      const url = location.origin + '/'; const svg = qrSvg(url);
      const school = (typeof schoolInfo !== 'undefined' && schoolInfo && schoolInfo.name) || 'School';
      let pages = '';
      for(let i = 0; i < list.length; i += 6) pages += '<div class="sheet">' + list.slice(i, i + 6).map(x => slipHtml(x, school, url, svg)).join('') + '</div>';
      printHtml('<!doctype html><html><head><meta charset="utf-8"><title>Login slips</title><style>' + slipCss + '</style></head><body>' + pages + '</body></html>');
      out(card, '<span class="blk-ok">✓ ' + list.length + ' slip(s) ready</span> — the print window shows 6 per page. Choose “Save as PDF” to keep a copy. Cut along the dotted lines.');
    }catch(e){ out(card, '<span style="color:#b3261e;">' + esc(e.message) + '</span>'); }
  }

  /* ---------- mount (Admin only), above the logins list ---------- */
  function mount(){
    const view = document.getElementById('view-studentparentlogins');
    if(!view) return false;
    let card = document.getElementById('blkCard');
    const isAdmin = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'Admin';
    if(!isAdmin){ if(card) card.remove(); return true; }
    if(!card){
      card = document.createElement('div'); card.id = 'blkCard';
      const body = document.getElementById('studentParentLoginsBody');
      if(body) body.parentNode.insertBefore(card, body); else view.appendChild(card);
      draw(card);
    }
    return true;
  }
  function refreshWhenShown(){
    const view = document.getElementById('view-studentparentlogins'); if(!view) return;
    let last = '';
    new MutationObserver(() => { const d = getComputedStyle(view).display; if(d !== 'none' && last === 'none'){ mount(); const c = document.getElementById('blkCard'); if(c){ draw(c); } } last = d; })
      .observe(view, { attributes: true, attributeFilter: ['style', 'class'] });
    last = getComputedStyle(view).display;
  }
  const tick = setInterval(() => { if(document.getElementById('view-studentparentlogins') && typeof currentUser !== 'undefined' && currentUser){ clearInterval(tick); mount(); refreshWhenShown(); } }, 800);
})();

/* ---------- Parent/Student home: "Turn on notifications" button ---------- */
(function(){
  let state = null;   // 'off' | 'on' | 'blocked' | 'unsupported' | 'unconfigured'
  const lang = () => { try{ return localStorage.getItem('portalLang') === 'te' ? 'te' : 'en'; }catch(e){ return 'en'; } };
  const TX = {
    en: { t: 'Get fee, marks and homework alerts on your phone', b: 'Turn on notifications', n: 'Remind me later', ok: 'Notifications are on for this phone.', blocked: 'Notifications are blocked. Open your phone Settings → Apps → Chrome (or this app) → Notifications and allow them.' },
    te: { t: 'ఫీజు, మార్కులు, హోంవర్క్ అలర్ట్‌లు మీ ఫోన్‌లో పొందండి', b: 'నోటిఫికేషన్లు ఆన్ చేయండి', n: 'తర్వాత గుర్తు చేయండి', ok: 'ఈ ఫోన్‌లో నోటిఫికేషన్లు ఆన్ అయ్యాయి.', blocked: 'నోటిఫికేషన్లు బ్లాక్ అయ్యాయి. ఫోన్ Settings → Apps → Chrome → Notifications లో అనుమతించండి.' }
  };
  const isParent = () => typeof currentUser !== 'undefined' && currentUser && ['Parent', 'Student'].includes(currentUser.role);
  async function check(){
    try{
      if(!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return state = 'unsupported';
      const k = await fetch('/api/push/vapid-key'); if(!k.ok) return state = 'unconfigured';
      if(Notification.permission === 'denied') return state = 'blocked';
      const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription();
      return state = (sub && Notification.permission === 'granted') ? 'on' : 'off';
    }catch(e){ return state = 'unsupported'; }
  }
  function paint(){
    const hero = document.getElementById('ppHero'); if(!hero || document.getElementById('ppNotif')) return;
    if(!isParent() || (state !== 'off' && state !== 'blocked')) return;
    const L = TX[lang()];
    const d = document.createElement('div'); d.id = 'ppNotif';
    d.style.cssText = 'margin:12px 0;padding:12px 14px;border-radius:14px;background:#fff7e0;border:1px solid #f0d78a;display:flex;gap:10px;align-items:center;flex-wrap:wrap;';
    d.innerHTML = '<span style="font-size:1.4rem;">🔔</span><div style="flex:1 1 200px;font-weight:600;color:#4a3b00;">' + L.t + '</div>' +
      '<button type="button" class="btn btn-primary" id="ppNotifOn">' + L.b + '</button>';
    hero.insertAdjacentElement('afterend', d);
    if(state === 'blocked'){ d.querySelector('div').textContent = L.blocked; d.querySelector('#ppNotifOn').remove(); }
    d.querySelector('#ppNotifOn').onclick = async () => {
      try{ if(typeof window.ncEnablePush === 'function') await window.ncEnablePush(); }catch(e){}
      await check();
      if(state === 'on'){ d.remove(); }
      else if(state === 'blocked'){ d.querySelector('div').textContent = L.blocked; d.querySelector('#ppNotifOn').remove(); }
    };
  }
  let t = null;
  new MutationObserver(() => { if(t) return; t = setTimeout(async () => { t = null; if(!isParent()) return; if(state === null) await check(); paint(); }, 400); })
    .observe(document.documentElement, { childList: true, subtree: true });
})();
