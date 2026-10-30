
fn a32(a:f32,b:f32)->f32{return fma(1.0,a,b);}
fn s32(a:f32,b:f32)->f32{return fma(-1.0,b,a);}
fn twoSum(a:f32,b:f32)->vec2<f32>{let s=a32(a,b);let v=s32(s,a);let error=a32(s32(a,s32(s,v)),s32(b,v));return vec2<f32>(s,error);}
fn ddAdd(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{let s=twoSum(a.x,b.x);return twoSum(s.x,a32(s.y,a32(a.y,b.y)));}
fn ddSub(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{return ddAdd(a,-b);}
fn ddMul(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{let p=a.x*b.x;var e=fma(a.x,b.x,-p);e=fma(a.x,b.y,e);e=fma(a.y,b.x,e);e=fma(a.y,b.y,e);return twoSum(p,e);}
fn ddFma(a:vec2<f32>,b:vec2<f32>,c:vec2<f32>)->vec2<f32>{return ddAdd(ddMul(a,b),c);}
@group(0) @binding(0) var<storage,read> input:array<u32>;
@group(0) @binding(1) var<storage,read_write> variance:array<f32>;

fn castCertified(value:vec2<f32>,radius:f32)->bool{
 let bits=bitcast<u32>(value.x);let magnitude=bits&2147483647u;let exponent=magnitude>>23u;if(exponent<=24u||exponent>=255u){return false;}
 let step=bitcast<f32>((exponent-24u)<<23u);var lower=select(step,step*0.5,(magnitude&8388607u)==0u);var upper=step;
 if((bits&2147483648u)!=0u){let swap=upper;upper=lower;lower=swap;}
 return s32(value.y,radius)> -lower&&a32(value.y,radius)<upper;
}
fn down32(value:f32)->f32{let bits=bitcast<u32>(value);if((bits&2147483647u)<8388608u){return -bitcast<f32>(8388608u);}return bitcast<f32>(select(bits-1u,bits+1u,(bits&2147483648u)!=0u));}
fn up32(value:f32)->f32{let bits=bitcast<u32>(value);if((bits&2147483647u)<8388608u){return bitcast<f32>(8388608u);}return bitcast<f32>(select(bits+1u,bits-1u,(bits&2147483648u)!=0u));}
fn squareInterval(value:vec2<f32>,radius:f32)->vec2<f32>{
 let lo=down32(a32(value.x,down32(s32(value.y,radius))));let hi=up32(a32(value.x,up32(a32(value.y,radius))));let maximum=max(abs(lo),abs(hi));
 if(maximum>0.0&&maximum<bitcast<f32>(536870912u)){return vec2<f32>(0.0,bitcast<f32>(8388608u));}
 let lower=select(min(lo*lo,hi*hi),0.0,lo<=0.0&&hi>=0.0);return vec2<f32>(lower,maximum*maximum);
}
@group(0) @binding(2) var<storage,read_write> rejected:array<u32>;
struct Params{width:u32,height:u32,plane:u32,groupsX:u32};
@group(0) @binding(3) var<uniform> p:Params;
fn byte(at:u32)->u32{return (input[at/4u]>>((at%4u)*8u))&255u;}
@compute @workgroup_size(32) fn main(@builtin(global_invocation_id) id:vec3<u32>){
let block=id.x+id.y*p.groupsX*32u;if(block>=arrayLength(&variance)){return;}
let channel=block/p.plane;let point=block%p.plane;let cols=p.width-4u;
let first=byte(((point/cols)*p.width+point%cols)*3u+channel);var sameBytes=true;for(var dy=0u;dy<5u&&sameBytes;dy++){for(var dx=0u;dx<5u&&sameBytes;dx++){sameBytes=byte(((point/cols+dy)*p.width+point%cols+dx)*3u+channel)==first;}}if(sameBytes){variance[block]=0.0;rejected[block]=first+2u;return;}
let v0=vec2<f32>(f32(byte(((point/cols+0u)*p.width+point%cols+0u)*3u+channel)),0.0);
let v1=vec2<f32>(f32(byte(((point/cols+0u)*p.width+point%cols+1u)*3u+channel)),0.0);
let v2=vec2<f32>(f32(byte(((point/cols+0u)*p.width+point%cols+2u)*3u+channel)),0.0);
let v3=vec2<f32>(f32(byte(((point/cols+0u)*p.width+point%cols+3u)*3u+channel)),0.0);
let v4=vec2<f32>(f32(byte(((point/cols+0u)*p.width+point%cols+4u)*3u+channel)),0.0);
let v5=vec2<f32>(f32(byte(((point/cols+1u)*p.width+point%cols+0u)*3u+channel)),0.0);
let v6=vec2<f32>(f32(byte(((point/cols+1u)*p.width+point%cols+1u)*3u+channel)),0.0);
let v7=vec2<f32>(f32(byte(((point/cols+1u)*p.width+point%cols+2u)*3u+channel)),0.0);
let v8=vec2<f32>(f32(byte(((point/cols+1u)*p.width+point%cols+3u)*3u+channel)),0.0);
let v9=vec2<f32>(f32(byte(((point/cols+1u)*p.width+point%cols+4u)*3u+channel)),0.0);
let v10=vec2<f32>(f32(byte(((point/cols+2u)*p.width+point%cols+0u)*3u+channel)),0.0);
let v11=vec2<f32>(f32(byte(((point/cols+2u)*p.width+point%cols+1u)*3u+channel)),0.0);
let v12=vec2<f32>(f32(byte(((point/cols+2u)*p.width+point%cols+2u)*3u+channel)),0.0);
let v13=vec2<f32>(f32(byte(((point/cols+2u)*p.width+point%cols+3u)*3u+channel)),0.0);
let v14=vec2<f32>(f32(byte(((point/cols+2u)*p.width+point%cols+4u)*3u+channel)),0.0);
let v15=vec2<f32>(f32(byte(((point/cols+3u)*p.width+point%cols+0u)*3u+channel)),0.0);
let v16=vec2<f32>(f32(byte(((point/cols+3u)*p.width+point%cols+1u)*3u+channel)),0.0);
let v17=vec2<f32>(f32(byte(((point/cols+3u)*p.width+point%cols+2u)*3u+channel)),0.0);
let v18=vec2<f32>(f32(byte(((point/cols+3u)*p.width+point%cols+3u)*3u+channel)),0.0);
let v19=vec2<f32>(f32(byte(((point/cols+3u)*p.width+point%cols+4u)*3u+channel)),0.0);
let v20=vec2<f32>(f32(byte(((point/cols+4u)*p.width+point%cols+0u)*3u+channel)),0.0);
let v21=vec2<f32>(f32(byte(((point/cols+4u)*p.width+point%cols+1u)*3u+channel)),0.0);
let v22=vec2<f32>(f32(byte(((point/cols+4u)*p.width+point%cols+2u)*3u+channel)),0.0);
let v23=vec2<f32>(f32(byte(((point/cols+4u)*p.width+point%cols+3u)*3u+channel)),0.0);
let v24=vec2<f32>(f32(byte(((point/cols+4u)*p.width+point%cols+4u)*3u+channel)),0.0);
let v25=vec2<f32>(bitcast<f32>(1073741824u),bitcast<f32>(0u));
let v26=ddMul(v0,v25);
let v27=ddMul(v1,v25);
let v28=ddSub(v10,v5);
let v29=ddSub(v11,v6);
let v30=ddAdd(v10,v5);
let v31=ddAdd(v11,v6);
let v32=ddSub(v20,v15);
let v33=ddSub(v21,v16);
let v34=ddAdd(v20,v15);
let v35=ddAdd(v21,v16);
let v36=ddAdd(v28,v28);
let v37=ddAdd(v29,v29);
let v38=ddAdd(v32,v32);
let v39=ddAdd(v33,v33);
let v40=ddAdd(v30,v30);
let v41=ddAdd(v31,v31);
let v42=ddAdd(v34,v34);
let v43=ddAdd(v35,v35);
let v44=ddAdd(v40,v26);
let v45=ddAdd(v41,v27);
let v46=ddAdd(v42,v44);
let v47=ddAdd(v43,v45);
let v48=vec2<f32>(bitcast<f32>(1050556282u),bitcast<f32>(2987196779u));
let v49=ddFma(v40,v48,v26);
let v50=ddFma(v41,v48,v27);
let v51=vec2<f32>(bitcast<f32>(3209632701u),bitcast<f32>(839713131u));
let v52=ddFma(v42,v51,v49);
let v53=ddFma(v43,v51,v50);
let v54=ddFma(v40,v51,v26);
let v55=ddFma(v41,v51,v27);
let v56=ddFma(v42,v48,v54);
let v57=ddFma(v43,v48,v55);
let v58=vec2<f32>(bitcast<f32>(1058437400u),bitcast<f32>(839822156u));
let v59=ddMul(v38,v58);
let v60=ddMul(v39,v58);
let v61=vec2<f32>(bitcast<f32>(1064532081u),bitcast<f32>(2999696048u));
let v62=ddFma(v36,v61,v59);
let v63=ddFma(v37,v61,v60);
let v64=vec2<f32>(bitcast<f32>(3212015729u),bitcast<f32>(852212400u));
let v65=ddMul(v38,v64);
let v66=ddMul(v39,v64);
let v67=ddFma(v36,v58,v65);
let v68=ddFma(v37,v58,v66);
let v69=ddAdd(v62,v52);
let v70=ddAdd(v63,v53);
let v71=ddSub(v52,v62);
let v72=ddSub(v53,v63);
let v73=ddAdd(v67,v56);
let v74=ddAdd(v68,v57);
let v75=ddSub(v56,v67);
let v76=ddSub(v57,v68);
let v77=vec2<f32>(bitcast<f32>(1050798235u),bitcast<f32>(823267908u));
let v78=ddMul(v77,v46);
let v79=ddMul(v77,v47);
let v80=ddMul(v77,v71);
let v81=ddMul(v77,v72);
let v82=ddMul(v77,v75);
let v83=ddMul(v77,v76);
let v84=ddMul(v77,v73);
let v85=ddMul(v77,v74);
let v86=ddMul(v77,v69);
let v87=ddMul(v77,v70);
let v88=vec2<f32>(bitcast<f32>(1050556282u),bitcast<f32>(2987196779u));
let v89=ddMul(v80,v88);
let v90=ddMul(v81,v88);
let v91=ddFma(v61,v86,v89);
let v92=ddFma(v61,v87,v90);
let v93=-v86;
let v94=-v87;
let v95=ddMul(v88,v93);
let v96=ddMul(v88,v94);
let v97=ddFma(v61,v80,v95);
let v98=ddFma(v61,v81,v96);
let v99=ddAdd(v91,v97);
let v100=ddAdd(v92,v98);
let v101=vec2<f32>(bitcast<f32>(1056964608u),bitcast<f32>(0u));
let v102=ddMul(v99,v101);
let v103=ddMul(v100,v101);
let v104=ddSub(v91,v97);
let v105=ddSub(v92,v98);
let v106=ddMul(v104,v101);
let v107=ddMul(v105,v101);
let v108=ddMul(v82,v58);
let v109=ddMul(v83,v58);
let v110=vec2<f32>(bitcast<f32>(1062149053u),bitcast<f32>(2987196779u));
let v111=ddFma(v110,v84,v108);
let v112=ddFma(v110,v85,v109);
let v113=-v84;
let v114=-v85;
let v115=ddMul(v58,v113);
let v116=ddMul(v58,v114);
let v117=ddFma(v110,v82,v115);
let v118=ddFma(v110,v83,v116);
let v119=ddAdd(v111,v117);
let v120=ddAdd(v112,v118);
let v121=ddMul(v119,v101);
let v122=ddMul(v120,v101);
let v123=ddSub(v111,v117);
let v124=ddSub(v112,v118);
let v125=ddMul(v123,v101);
let v126=ddMul(v124,v101);
let v127=vec2<f32>(bitcast<f32>(1060439283u),bitcast<f32>(844097402u));
let v128=ddMul(v78,v127);
let v129=ddMul(v79,v127);
let v130=ddMul(v2,v25);
let v131=ddMul(v3,v25);
let v132=ddSub(v12,v7);
let v133=ddSub(v13,v8);
let v134=ddAdd(v12,v7);
let v135=ddAdd(v13,v8);
let v136=ddSub(v22,v17);
let v137=ddSub(v23,v18);
let v138=ddAdd(v22,v17);
let v139=ddAdd(v23,v18);
let v140=ddAdd(v132,v132);
let v141=ddAdd(v133,v133);
let v142=ddAdd(v136,v136);
let v143=ddAdd(v137,v137);
let v144=ddAdd(v134,v134);
let v145=ddAdd(v135,v135);
let v146=ddAdd(v138,v138);
let v147=ddAdd(v139,v139);
let v148=ddAdd(v144,v130);
let v149=ddAdd(v145,v131);
let v150=ddAdd(v146,v148);
let v151=ddAdd(v147,v149);
let v152=ddFma(v144,v48,v130);
let v153=ddFma(v145,v48,v131);
let v154=ddFma(v146,v51,v152);
let v155=ddFma(v147,v51,v153);
let v156=ddFma(v144,v51,v130);
let v157=ddFma(v145,v51,v131);
let v158=ddFma(v146,v48,v156);
let v159=ddFma(v147,v48,v157);
let v160=ddMul(v142,v58);
let v161=ddMul(v143,v58);
let v162=ddFma(v140,v61,v160);
let v163=ddFma(v141,v61,v161);
let v164=ddMul(v142,v64);
let v165=ddMul(v143,v64);
let v166=ddFma(v140,v58,v164);
let v167=ddFma(v141,v58,v165);
let v168=ddAdd(v162,v154);
let v169=ddAdd(v163,v155);
let v170=ddSub(v154,v162);
let v171=ddSub(v155,v163);
let v172=ddAdd(v166,v158);
let v173=ddAdd(v167,v159);
let v174=ddSub(v158,v166);
let v175=ddSub(v159,v167);
let v176=ddMul(v77,v150);
let v177=ddMul(v77,v151);
let v178=ddMul(v77,v170);
let v179=ddMul(v77,v171);
let v180=ddMul(v77,v174);
let v181=ddMul(v77,v175);
let v182=ddMul(v77,v172);
let v183=ddMul(v77,v173);
let v184=ddMul(v77,v168);
let v185=ddMul(v77,v169);
let v186=ddMul(v178,v88);
let v187=ddMul(v179,v88);
let v188=ddFma(v61,v184,v186);
let v189=ddFma(v61,v185,v187);
let v190=-v184;
let v191=-v185;
let v192=ddMul(v88,v190);
let v193=ddMul(v88,v191);
let v194=ddFma(v61,v178,v192);
let v195=ddFma(v61,v179,v193);
let v196=ddAdd(v188,v194);
let v197=ddAdd(v189,v195);
let v198=ddMul(v196,v101);
let v199=ddMul(v197,v101);
let v200=ddSub(v188,v194);
let v201=ddSub(v189,v195);
let v202=ddMul(v200,v101);
let v203=ddMul(v201,v101);
let v204=ddMul(v180,v58);
let v205=ddMul(v181,v58);
let v206=ddFma(v110,v182,v204);
let v207=ddFma(v110,v183,v205);
let v208=-v182;
let v209=-v183;
let v210=ddMul(v58,v208);
let v211=ddMul(v58,v209);
let v212=ddFma(v110,v180,v210);
let v213=ddFma(v110,v181,v211);
let v214=ddAdd(v206,v212);
let v215=ddAdd(v207,v213);
let v216=ddMul(v214,v101);
let v217=ddMul(v215,v101);
let v218=ddSub(v206,v212);
let v219=ddSub(v207,v213);
let v220=ddMul(v218,v101);
let v221=ddMul(v219,v101);
let v222=ddMul(v176,v127);
let v223=ddMul(v177,v127);
let v224=ddMul(v4,v25);
let v225=ddSub(v14,v9);
let v226=ddAdd(v14,v9);
let v227=ddSub(v24,v19);
let v228=ddAdd(v24,v19);
let v229=ddAdd(v225,v225);
let v230=ddAdd(v227,v227);
let v231=ddAdd(v226,v226);
let v232=ddAdd(v228,v228);
let v233=ddAdd(v231,v224);
let v234=ddAdd(v232,v233);
let v235=ddFma(v231,v48,v224);
let v236=ddFma(v232,v51,v235);
let v237=ddFma(v231,v51,v224);
let v238=ddFma(v232,v48,v237);
let v239=ddMul(v230,v58);
let v240=ddFma(v229,v61,v239);
let v241=ddMul(v230,v64);
let v242=ddFma(v229,v58,v241);
let v243=ddAdd(v240,v236);
let v244=ddSub(v236,v240);
let v245=ddAdd(v242,v238);
let v246=ddSub(v238,v242);
let v247=ddMul(v77,v234);
let v248=ddMul(v77,v244);
let v249=ddMul(v77,v246);
let v250=ddMul(v77,v245);
let v251=ddMul(v77,v243);
let v252=ddMul(v248,v88);
let v253=ddFma(v61,v251,v252);
let v254=-v251;
let v255=ddMul(v88,v254);
let v256=ddFma(v61,v248,v255);
let v257=ddAdd(v253,v256);
let v258=ddMul(v257,v101);
let v259=ddSub(v253,v256);
let v260=ddMul(v259,v101);
let v261=ddMul(v249,v58);
let v262=ddFma(v110,v250,v261);
let v263=-v250;
let v264=ddMul(v58,v263);
let v265=ddFma(v110,v249,v264);
let v266=ddAdd(v262,v265);
let v267=ddMul(v266,v101);
let v268=ddSub(v262,v265);
let v269=ddMul(v268,v101);
let v270=ddMul(v247,v127);
let v271=ddMul(v128,v25);
let v272=ddMul(v102,v25);
let v273=ddSub(v222,v129);
let v274=ddSub(v198,v103);
let v275=ddAdd(v222,v129);
let v276=ddAdd(v198,v103);
let v277=ddSub(v270,v223);
let v278=ddSub(v258,v199);
let v279=ddAdd(v270,v223);
let v280=ddAdd(v258,v199);
let v281=ddAdd(v273,v273);
let v282=ddAdd(v274,v274);
let v283=ddAdd(v277,v277);
let v284=ddAdd(v278,v278);
let v285=ddAdd(v275,v275);
let v286=ddAdd(v276,v276);
let v287=ddAdd(v279,v279);
let v288=ddAdd(v280,v280);

let v290=ddAdd(v286,v272);

let v292=ddAdd(v288,v290);
let v293=ddFma(v285,v48,v271);
let v294=ddFma(v286,v48,v272);
let v295=ddFma(v287,v51,v293);
let v296=ddFma(v288,v51,v294);
let v297=ddFma(v285,v51,v271);
let v298=ddFma(v286,v51,v272);
let v299=ddFma(v287,v48,v297);
let v300=ddFma(v288,v48,v298);
let v301=ddMul(v283,v58);
let v302=ddMul(v284,v58);
let v303=ddFma(v281,v61,v301);
let v304=ddFma(v282,v61,v302);
let v305=ddMul(v283,v64);
let v306=ddMul(v284,v64);
let v307=ddFma(v281,v58,v305);
let v308=ddFma(v282,v58,v306);
let v309=ddAdd(v303,v295);
let v310=ddAdd(v304,v296);
let v311=ddSub(v295,v303);
let v312=ddSub(v296,v304);
let v313=ddAdd(v307,v299);
let v314=ddAdd(v308,v300);
let v315=ddSub(v299,v307);
let v316=ddSub(v300,v308);

let v318=ddMul(v77,v292);
let v319=ddMul(v77,v311);
let v320=ddMul(v77,v312);
let v321=ddMul(v77,v315);
let v322=ddMul(v77,v316);
let v323=ddMul(v77,v313);
let v324=ddMul(v77,v314);
let v325=ddMul(v77,v309);
let v326=ddMul(v77,v310);
let v327=ddMul(v319,v88);
let v328=ddMul(v320,v88);
let v329=ddFma(v61,v325,v327);
let v330=ddFma(v61,v326,v328);
let v331=-v325;
let v332=-v326;
let v333=ddMul(v88,v331);
let v334=ddMul(v88,v332);
let v335=ddFma(v61,v319,v333);
let v336=ddFma(v61,v320,v334);
let v337=ddAdd(v329,v335);
let v338=ddAdd(v330,v336);
let v339=ddMul(v337,v101);
let v340=ddMul(v338,v101);
let v341=ddSub(v329,v335);

let v343=ddMul(v341,v101);

let v345=ddMul(v321,v58);
let v346=ddMul(v322,v58);
let v347=ddFma(v110,v323,v345);
let v348=ddFma(v110,v324,v346);
let v349=-v323;
let v350=-v324;
let v351=ddMul(v58,v349);
let v352=ddMul(v58,v350);
let v353=ddFma(v110,v321,v351);
let v354=ddFma(v110,v322,v352);
let v355=ddAdd(v347,v353);
let v356=ddAdd(v348,v354);
let v357=ddMul(v355,v101);
let v358=ddMul(v356,v101);
let v359=ddSub(v347,v353);
let v360=ddSub(v348,v354);
let v361=ddMul(v359,v101);
let v362=ddMul(v360,v101);

let v364=ddMul(v318,v127);
let v365=ddMul(v121,v25);
let v366=ddMul(v125,v25);
let v367=ddSub(v216,v122);
let v368=ddSub(v220,v126);
let v369=ddAdd(v216,v122);
let v370=ddAdd(v220,v126);
let v371=ddSub(v267,v217);
let v372=ddSub(v269,v221);
let v373=ddAdd(v267,v217);
let v374=ddAdd(v269,v221);
let v375=ddAdd(v367,v367);
let v376=ddAdd(v368,v368);
let v377=ddAdd(v371,v371);
let v378=ddAdd(v372,v372);
let v379=ddAdd(v369,v369);
let v380=ddAdd(v370,v370);
let v381=ddAdd(v373,v373);
let v382=ddAdd(v374,v374);
let v383=ddAdd(v379,v365);
let v384=ddAdd(v380,v366);
let v385=ddAdd(v381,v383);
let v386=ddAdd(v382,v384);
let v387=ddFma(v379,v48,v365);
let v388=ddFma(v380,v48,v366);
let v389=ddFma(v381,v51,v387);
let v390=ddFma(v382,v51,v388);
let v391=ddFma(v379,v51,v365);

let v393=ddFma(v381,v48,v391);

let v395=ddMul(v377,v58);
let v396=ddMul(v378,v58);
let v397=ddFma(v375,v61,v395);
let v398=ddFma(v376,v61,v396);
let v399=ddMul(v377,v64);

let v401=ddFma(v375,v58,v399);

let v403=ddAdd(v397,v389);
let v404=ddAdd(v398,v390);
let v405=ddSub(v389,v397);
let v406=ddSub(v390,v398);
let v407=ddAdd(v401,v393);

let v409=ddSub(v393,v401);

let v411=ddMul(v77,v385);
let v412=ddMul(v77,v386);
let v413=ddMul(v77,v405);
let v414=ddMul(v77,v406);
let v415=ddMul(v77,v409);

let v417=ddMul(v77,v407);

let v419=ddMul(v77,v403);
let v420=ddMul(v77,v404);
let v421=ddMul(v413,v88);
let v422=ddMul(v414,v88);
let v423=ddFma(v61,v419,v421);
let v424=ddFma(v61,v420,v422);
let v425=-v419;
let v426=-v420;
let v427=ddMul(v88,v425);
let v428=ddMul(v88,v426);
let v429=ddFma(v61,v413,v427);
let v430=ddFma(v61,v414,v428);
let v431=ddAdd(v423,v429);
let v432=ddAdd(v424,v430);
let v433=ddMul(v431,v101);
let v434=ddMul(v432,v101);




let v439=ddMul(v415,v58);

let v441=ddFma(v110,v417,v439);

let v443=-v417;

let v445=ddMul(v58,v443);

let v447=ddFma(v110,v415,v445);

let v449=ddAdd(v441,v447);

let v451=ddMul(v449,v101);





let v457=ddMul(v411,v127);
let v458=ddMul(v412,v127);
let v459=ddMul(v106,v25);

let v461=ddAdd(v202,v107);

let v463=ddAdd(v260,v203);


let v466=ddAdd(v461,v461);
let v467=ddAdd(v463,v463);
let v468=ddAdd(v466,v459);
let v469=ddAdd(v467,v468);












let v482=ddMul(v77,v469);






















let v505=ddMul(v482,v127);
var squares:array<f32,25>;
var lowerSquares:array<f32,25>;var upperSquares:array<f32,25>;
squares[0]=0.0;
lowerSquares[0]=0.0;upperSquares[0]=0.0;
let c1=a32(v339.x,v339.y);squares[1]=c1*c1;
if(castCertified(v339,bitcast<f32>(827296198u))){lowerSquares[1]=squares[1];upperSquares[1]=squares[1];}else{let interval=squareInterval(v339,bitcast<f32>(827296198u));lowerSquares[1]=interval.x;upperSquares[1]=interval.y;}
let c2=a32(v357.x,v357.y);squares[2]=c2*c2;
if(castCertified(v357,bitcast<f32>(828824785u))){lowerSquares[2]=squares[2];upperSquares[2]=squares[2];}else{let interval=squareInterval(v357,bitcast<f32>(828824785u));lowerSquares[2]=interval.x;upperSquares[2]=interval.y;}
let c3=a32(v361.x,v361.y);squares[3]=c3*c3;
if(castCertified(v361,bitcast<f32>(828795506u))){lowerSquares[3]=squares[3];upperSquares[3]=squares[3];}else{let interval=squareInterval(v361,bitcast<f32>(828795506u));lowerSquares[3]=interval.x;upperSquares[3]=interval.y;}
let c4=a32(v343.x,v343.y);squares[4]=c4*c4;
if(castCertified(v343,bitcast<f32>(827325477u))){lowerSquares[4]=squares[4];upperSquares[4]=squares[4];}else{let interval=squareInterval(v343,bitcast<f32>(827325477u));lowerSquares[4]=interval.x;upperSquares[4]=interval.y;}
let c5=a32(v364.x,v364.y);squares[5]=c5*c5;
if(castCertified(v364,bitcast<f32>(823861857u))){lowerSquares[5]=squares[5];upperSquares[5]=squares[5];}else{let interval=squareInterval(v364,bitcast<f32>(823861857u));lowerSquares[5]=interval.x;upperSquares[5]=interval.y;}
let c6=a32(v340.x,v340.y);squares[6]=c6*c6;
if(castCertified(v340,bitcast<f32>(834568251u))){lowerSquares[6]=squares[6];upperSquares[6]=squares[6];}else{let interval=squareInterval(v340,bitcast<f32>(834568251u));lowerSquares[6]=interval.x;upperSquares[6]=interval.y;}
let c7=a32(v358.x,v358.y);squares[7]=c7*c7;
if(castCertified(v358,bitcast<f32>(835946289u))){lowerSquares[7]=squares[7];upperSquares[7]=squares[7];}else{let interval=squareInterval(v358,bitcast<f32>(835946289u));lowerSquares[7]=interval.x;upperSquares[7]=interval.y;}
let c8=a32(v362.x,v362.y);squares[8]=c8*c8;
if(castCertified(v362,bitcast<f32>(835933546u))){lowerSquares[8]=squares[8];upperSquares[8]=squares[8];}else{let interval=squareInterval(v362,bitcast<f32>(835933546u));lowerSquares[8]=interval.x;upperSquares[8]=interval.y;}
squares[9]=0.0;
lowerSquares[9]=0.0;upperSquares[9]=0.0;
let c10=a32(v457.x,v457.y);squares[10]=c10*c10;
if(castCertified(v457,bitcast<f32>(824893895u))){lowerSquares[10]=squares[10];upperSquares[10]=squares[10];}else{let interval=squareInterval(v457,bitcast<f32>(824893895u));lowerSquares[10]=interval.x;upperSquares[10]=interval.y;}
let c11=a32(v433.x,v433.y);squares[11]=c11*c11;
if(castCertified(v433,bitcast<f32>(835783418u))){lowerSquares[11]=squares[11];upperSquares[11]=squares[11];}else{let interval=squareInterval(v433,bitcast<f32>(835783418u));lowerSquares[11]=interval.x;upperSquares[11]=interval.y;}
let c12=a32(v451.x,v451.y);squares[12]=c12*c12;
if(castCertified(v451,bitcast<f32>(837294547u))){lowerSquares[12]=squares[12];upperSquares[12]=squares[12];}else{let interval=squareInterval(v451,bitcast<f32>(837294547u));lowerSquares[12]=interval.x;upperSquares[12]=interval.y;}
squares[13]=0.0;
lowerSquares[13]=0.0;upperSquares[13]=0.0;
squares[14]=0.0;
lowerSquares[14]=0.0;upperSquares[14]=0.0;
let c15=a32(v458.x,v458.y);squares[15]=c15*c15;
if(castCertified(v458,bitcast<f32>(824753110u))){lowerSquares[15]=squares[15];upperSquares[15]=squares[15];}else{let interval=squareInterval(v458,bitcast<f32>(824753110u));lowerSquares[15]=interval.x;upperSquares[15]=interval.y;}
let c16=a32(v434.x,v434.y);squares[16]=c16*c16;
if(castCertified(v434,bitcast<f32>(835571343u))){lowerSquares[16]=squares[16];upperSquares[16]=squares[16];}else{let interval=squareInterval(v434,bitcast<f32>(835571343u));lowerSquares[16]=interval.x;upperSquares[16]=interval.y;}
squares[17]=0.0;
lowerSquares[17]=0.0;upperSquares[17]=0.0;
squares[18]=0.0;
lowerSquares[18]=0.0;upperSquares[18]=0.0;
squares[19]=0.0;
lowerSquares[19]=0.0;upperSquares[19]=0.0;
let c20=a32(v505.x,v505.y);squares[20]=c20*c20;
if(castCertified(v505,bitcast<f32>(824002642u))){lowerSquares[20]=squares[20];upperSquares[20]=squares[20];}else{let interval=squareInterval(v505,bitcast<f32>(824002642u));lowerSquares[20]=interval.x;upperSquares[20]=interval.y;}
squares[21]=0.0;
lowerSquares[21]=0.0;upperSquares[21]=0.0;
squares[22]=0.0;
lowerSquares[22]=0.0;upperSquares[22]=0.0;
squares[23]=0.0;
lowerSquares[23]=0.0;upperSquares[23]=0.0;
squares[24]=0.0;
lowerSquares[24]=0.0;upperSquares[24]=0.0;
var r0=squares[0];
r0=a32(r0,squares[8]);
r0=a32(r0,squares[16]);
var r1=squares[1];
r1=a32(r1,squares[9]);
r1=a32(r1,squares[17]);
var r2=squares[2];
r2=a32(r2,squares[10]);
r2=a32(r2,squares[18]);
var r3=squares[3];
r3=a32(r3,squares[11]);
r3=a32(r3,squares[19]);
var r4=squares[4];
r4=a32(r4,squares[12]);
r4=a32(r4,squares[20]);
var r5=squares[5];
r5=a32(r5,squares[13]);
r5=a32(r5,squares[21]);
var r6=squares[6];
r6=a32(r6,squares[14]);
r6=a32(r6,squares[22]);
var r7=squares[7];
r7=a32(r7,squares[15]);
r7=a32(r7,squares[23]);
var sum=a32(a32(a32(r0,r1),a32(r2,r3)),a32(a32(r4,r5),a32(r6,r7)));
sum=a32(sum,squares[24]);
variance[block]=sum;
var rLo0=lowerSquares[0];
rLo0=a32(rLo0,lowerSquares[8]);
rLo0=a32(rLo0,lowerSquares[16]);
var rLo1=lowerSquares[1];
rLo1=a32(rLo1,lowerSquares[9]);
rLo1=a32(rLo1,lowerSquares[17]);
var rLo2=lowerSquares[2];
rLo2=a32(rLo2,lowerSquares[10]);
rLo2=a32(rLo2,lowerSquares[18]);
var rLo3=lowerSquares[3];
rLo3=a32(rLo3,lowerSquares[11]);
rLo3=a32(rLo3,lowerSquares[19]);
var rLo4=lowerSquares[4];
rLo4=a32(rLo4,lowerSquares[12]);
rLo4=a32(rLo4,lowerSquares[20]);
var rLo5=lowerSquares[5];
rLo5=a32(rLo5,lowerSquares[13]);
rLo5=a32(rLo5,lowerSquares[21]);
var rLo6=lowerSquares[6];
rLo6=a32(rLo6,lowerSquares[14]);
rLo6=a32(rLo6,lowerSquares[22]);
var rLo7=lowerSquares[7];
rLo7=a32(rLo7,lowerSquares[15]);
rLo7=a32(rLo7,lowerSquares[23]);
var sumLo=a32(a32(a32(rLo0,rLo1),a32(rLo2,rLo3)),a32(a32(rLo4,rLo5),a32(rLo6,rLo7)));
sumLo=a32(sumLo,lowerSquares[24]);
var rHi0=upperSquares[0];
rHi0=a32(rHi0,upperSquares[8]);
rHi0=a32(rHi0,upperSquares[16]);
var rHi1=upperSquares[1];
rHi1=a32(rHi1,upperSquares[9]);
rHi1=a32(rHi1,upperSquares[17]);
var rHi2=upperSquares[2];
rHi2=a32(rHi2,upperSquares[10]);
rHi2=a32(rHi2,upperSquares[18]);
var rHi3=upperSquares[3];
rHi3=a32(rHi3,upperSquares[11]);
rHi3=a32(rHi3,upperSquares[19]);
var rHi4=upperSquares[4];
rHi4=a32(rHi4,upperSquares[12]);
rHi4=a32(rHi4,upperSquares[20]);
var rHi5=upperSquares[5];
rHi5=a32(rHi5,upperSquares[13]);
rHi5=a32(rHi5,upperSquares[21]);
var rHi6=upperSquares[6];
rHi6=a32(rHi6,upperSquares[14]);
rHi6=a32(rHi6,upperSquares[22]);
var rHi7=upperSquares[7];
rHi7=a32(rHi7,upperSquares[15]);
rHi7=a32(rHi7,upperSquares[23]);
var sumHi=a32(a32(a32(rHi0,rHi1),a32(rHi2,rHi3)),a32(a32(rHi4,rHi5),a32(rHi6,rHi7)));
sumHi=a32(sumHi,upperSquares[24]);
let error=max(abs(s32(sum,sumLo)),abs(s32(sumHi,sum)));rejected[block]=select(0u,1u,!(sum>=sumLo&&sum<=sumHi&&sum>=0.0&&sum<=1e30&&bitcast<u32>(sumLo)==bitcast<u32>(sumHi)&&bitcast<u32>(sum)==bitcast<u32>(sumLo)&&error<=bitcast<f32>(953267991u)));
}