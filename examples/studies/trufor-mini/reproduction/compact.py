"""Real structural reduction of TruFor to eight selected decoder units.

Original inference heads are absent. Only retained Transformer blocks are
registered. A saved compact checkpoint loads without the original weight file.
"""
import copy
import json
from pathlib import Path
import sys

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

LAB=Path(__file__).resolve().parent
PARENT=LAB.parent
NEURON=PARENT/'neuron_lab'
ROOT=LAB # Portable package: no repository ancestor is required at import.
SOURCE=Path(__file__).resolve().parent/'trufor_src'
sys.path.insert(0,str(SOURCE))
from models.cmx.encoders.dual_segformer import Attention
from models.cmx.net_utils import CrossAttention

FULL=[[0,1,2],[0,1,2,3],[0,1,2,3,4,5],[0,1,2]]
ENDS=[[0,2],[0,3],[0,5],[0,2]]
FOCI=[[0,2],[0,3],[4,5],[1,2]]
SINGLE=[[2],[3],[4],[1]]


def bounded_sdpa(q,k,v,scale,budget=128*1024**2,max_queries=4096):
    """Same global row-wise attention, bounded temporary query-key matrices."""
    rowbytes=q.shape[0]*q.shape[1]*k.shape[-2]*q.element_size()
    chunk=max(1,min(max_queries,budget//max(rowbytes,1)))
    if q.shape[-2]<=chunk:return F.scaled_dot_product_attention(q,k,v,dropout_p=0.,scale=scale)
    output=torch.empty_like(q)
    for start in range(0,q.shape[-2],chunk):
        stop=min(start+chunk,q.shape[-2])
        output[...,start:stop,:]=F.scaled_dot_product_attention(q[...,start:stop,:],k,v,dropout_p=0.,scale=scale)
    return output


class FusedAttention(Attention):
    def forward(self,x,H,W):
        b,n,c=x.shape;q=self.q(x).reshape(b,n,self.num_heads,c//self.num_heads).permute(0,2,1,3)
        if self.sr_ratio>1:
            source=self.sr(x.permute(0,2,1).reshape(b,c,H,W)).reshape(b,c,-1).permute(0,2,1)
            source=self.norm(source)
        else:source=x
        kv=self.kv(source).reshape(b,-1,2,self.num_heads,c//self.num_heads).permute(2,0,3,1,4)
        value=bounded_sdpa(q,kv[0],kv[1],self.scale)
        return self.proj_drop(self.proj(value.transpose(1,2).reshape(b,n,c)))


class FloatContext(CrossAttention):
    def forward(self,x1,x2):
        dtype=x1.dtype;a,b=super().forward(x1.float(),x2.float());return a.to(dtype),b.to(dtype)


class ReducedAttention(Attention):
    """Approximate only the contextual message; keep the full native residual."""
    def forward(self,x,H,W):
        b,n,c=x.shape;mode=self.approximation
        if self.sr_ratio>1:
            source=self.sr(x.permute(0,2,1).reshape(b,c,H,W)).reshape(b,c,-1).permute(0,2,1);source=self.norm(source)
        else:source=x
        kv=self.kv(source).reshape(b,-1,2,self.num_heads,c//self.num_heads).permute(2,0,3,1,4);k,v=kv[0],kv[1]
        if mode=='taylor':
            q=self.q(x).reshape(b,n,self.num_heads,c//self.num_heads).permute(0,2,1,3).float();k=k.float();v=v.float()
            center=q.mean(-2,keepdim=True);p=torch.softmax((center@k.transpose(-2,-1))*self.scale,-1)
            mk=p@k;mv=p@v
            jac=(k.transpose(-2,-1)@(v*p.transpose(-2,-1))-mk.transpose(-2,-1)@mv)*self.scale
            out=(mv+(q-center)@jac).to(x.dtype).transpose(1,2).reshape(b,n,c)
            return self.proj_drop(self.proj(out))
        if mode=='global':query=x.mean(1,keepdim=True);qh=qw=1
        else:
            step=int(mode.removeprefix('pool'));image=x.transpose(1,2).reshape(b,c,H,W)
            query=F.avg_pool2d(image,step,step,ceil_mode=True,count_include_pad=False);qh,qw=query.shape[-2:];query=query.flatten(2).transpose(1,2)
        q=self.q(query).reshape(b,-1,self.num_heads,c//self.num_heads).permute(0,2,1,3)
        value=bounded_sdpa(q,k,v,self.scale).transpose(1,2).reshape(b,qh*qw,c)
        out=self.proj_drop(self.proj(value))
        if mode=='global':return out.expand(b,n,c)
        return F.interpolate(out.transpose(1,2).reshape(b,c,qh,qw),size=(H,W),mode='bilinear',align_corners=False).flatten(2).transpose(1,2)


def fuse_sequences(module):
    for child in module.children():fuse_sequences(child)
    if isinstance(module,nn.Sequential):
        for i in range(len(module)-1):
            if isinstance(module[i],nn.Conv2d) and isinstance(module[i+1],nn.BatchNorm2d):
                module[i]=torch.nn.utils.fuse_conv_bn_eval(module[i],module[i+1]);module[i+1]=nn.Identity()


class NarrowNoise(nn.Module):
    def __init__(self,width=16):
        super().__init__();layers=[]
        for i in range(17):
            layers.append(nn.Conv2d(3 if i==0 else width,1 if i==16 else width,3,padding=1))
            if i<16:layers.append(nn.ReLU())
        self.layers=nn.Sequential(*layers)
        for i in range(17):self.register_buffer('boundary_'+str(i),torch.zeros(1 if i==16 else width,3,3))
    def forward(self,x):
        i=0
        for layer in self.layers:
            x=layer(x)
            if isinstance(layer,nn.Conv2d):
                k=getattr(self,'boundary_'+str(i));i+=1
                x[:,:,0,:]-=k[:,0,:].sum(-1)[None,:,None];x[:,:,-1,:]-=k[:,2,:].sum(-1)[None,:,None]
                x[:,:,:,0]-=k[:,:,0].sum(-1)[None,:,None];x[:,:,:,-1]-=k[:,:,2].sum(-1)[None,:,None]
                x[:,:,0,0]+=k[:,0,0];x[:,:,0,-1]+=k[:,0,2];x[:,:,-1,0]+=k[:,2,0];x[:,:,-1,-1]+=k[:,2,2]
        return x


class ProjectedFusion(nn.Module):
    """Exact affine collapse of a fusion module's last C outputs into 8."""
    def __init__(self,fusion,projection):
        super().__init__();self.cross=fusion.cross;embed=fusion.channel_emb
        self.hidden=nn.Sequential(*list(embed.channel_embed.children())[:3])
        last=embed.channel_embed[3];norm=embed.norm
        c=last.out_channels;outputs=projection.shape[0];p=projection[:,:,0,0].float()
        scale=norm.weight.float()/torch.sqrt(norm.running_var.float()+norm.eps)
        scaled=p*scale[None]
        self.residual=nn.Conv2d(2*c,outputs,1,bias=False);self.finish=nn.Conv2d(c,outputs,1,bias=True)
        with torch.no_grad():
            self.residual.weight.copy_((scaled@embed.residual.weight.float()[:,:,0,0])[:,:,None,None])
            self.finish.weight.copy_((scaled@last.weight.float()[:,:,0,0])[:,:,None,None])
            offset=p@norm.bias.float()+scaled@(last.bias.float()-norm.running_mean.float())
            if embed.residual.bias is not None:offset+=scaled@embed.residual.bias.float()
            self.finish.bias.copy_(offset)
        self.eval()
    def forward(self,a,b):
        shape=a.shape;bsize,c,h,w=shape
        x,y=self.cross(a.flatten(2).transpose(1,2),b.flatten(2).transpose(1,2))
        merged=torch.cat([x,y],-1).transpose(1,2).reshape(bsize,2*c,h,w).contiguous()
        return self.residual(merged.float())+self.finish(self.hidden(merged).float())


class CompactTruFor(nn.Module):
    def __init__(self,config,original=None):
        super().__init__();self.config=copy.deepcopy(config)
        if original is None:
            from models.cmx.encoders.dual_segformer import mit_b2
            from models.DnCNN import make_net
            backbone=mit_b2(norm_fuse=nn.BatchNorm2d).eval()
            noise=make_net(3,kernels=[3]*17,features=[64]*16+[1],bns=[False]+[True]*15+[False],
                           acts=['relu']*16+['linear'],dilats=[1]*17,bn_momentum=.1,padding=1).eval()
        else:backbone=original.backbone;noise=original.dncnn
        def duplicate(m):return copy.deepcopy(m).cpu() if original is not None else m
        self.rgb_patch=nn.ModuleList([duplicate(getattr(backbone,'patch_embed'+str(s))) for s in [1,2,3,4]])
        self.noise_patch=nn.ModuleList([duplicate(getattr(backbone,'extra_patch_embed'+str(s))) for s in [1,2,3,4]])
        for group in [self.rgb_patch,self.noise_patch]:group[0].proj.stride=(config.get('stride',4),)*2
        self.rgb_blocks=nn.ModuleList([nn.ModuleList([duplicate(getattr(backbone,'block'+str(s))[i]) for i in config['rgb'][s-1]]) for s in [1,2,3,4]])
        self.noise_blocks=nn.ModuleList([nn.ModuleList([duplicate(getattr(backbone,'extra_block'+str(s))[i]) for i in config['noise'][s-1]]) for s in [1,2,3,4]])
        for branch,group in [('rgb',self.rgb_blocks),('noise',self.noise_blocks)]:
            for stage,blocks in enumerate(group,1):
                for index,block in zip(config[branch][stage-1],blocks):
                    key=f'{branch}.{stage}.{index}'
                    for layer in ['fc1','fc2']:
                        rank=config.get('factor_ranks',{}).get(key+'.'+layer)
                        if rank:
                            old=getattr(block.mlp,layer)
                            setattr(block.mlp,layer,nn.Sequential(nn.Linear(old.in_features,rank,bias=False),nn.Linear(rank,old.out_features,bias=True)))
        self.rgb_norm=nn.ModuleList([duplicate(getattr(backbone,'norm'+str(s))) for s in [1,2,3,4]])
        self.noise_norm=nn.ModuleList([duplicate(getattr(backbone,'extra_norm'+str(s))) for s in [1,2,3,4]])
        self.rectify=nn.ModuleList([duplicate(m) for m in backbone.FRMs]);self.fusion=nn.ModuleList([duplicate(m) for m in backbone.FFMs])
        if config.get('npp','folded').startswith('narrow'):
            width=int(config['npp'].removeprefix('narrow'));self.noise=NarrowNoise(width)
            if original is not None:
                path=(NEURON if width==16 else LAB)/'models'/f'noiseprint-affine{width}.npz'
                with np.load(path) as z:self.noise.load_state_dict({k:torch.tensor(z[k]) for k in z.files})
        else:
            self.noise=duplicate(noise)
            if config.get('npp','folded')=='folded':fuse_sequences(self.noise)
        for m in self.fusion:m.eval();fuse_sequences(m)
        if original is None:
            for stage,channels in enumerate([64,128,320,512],1):self.register_buffer('v'+str(stage),torch.zeros(8,channels,1,1))
            self.register_buffer('bias',torch.zeros(1,8,1,1));self.register_buffer('read8',torch.zeros(1,8,1,1))
            self.register_buffer('read8_bias',torch.tensor(0.));self.register_buffer('read1',torch.tensor(0.));self.register_buffer('read1_bias',torch.tensor(0.))
        else:
            with np.load(NEURON/'models/collapsed-decoder-circuit.npz') as z:
                for stage in [1,2,3,4]:self.register_buffer('v'+str(stage),torch.tensor(z['stage'+str(stage)])[:,:,None,None])
                self.register_buffer('bias',torch.tensor(z['bias'])[None,:,None,None])
            probes=json.loads((NEURON/'models/probe-decoder.json').read_text())['path']
            self.register_buffer('read8',torch.tensor(probes['8']['coefficients'],dtype=torch.float32)[None,:,None,None])
            self.register_buffer('read8_bias',torch.tensor(probes['8']['bias'],dtype=torch.float32))
            self.register_buffer('read1',torch.tensor(probes['1']['coefficients'][0],dtype=torch.float32))
            self.register_buffer('read1_bias',torch.tensor(probes['1']['bias'],dtype=torch.float32))
        self.register_buffer('image_mean',torch.tensor([.485,.456,.406])[None,:,None,None]);self.register_buffer('image_scale',torch.tensor([.229,.224,.225])[None,:,None,None])
        self.eval()
        if config.get('project_fusion'):self.enable_projected_fusion()
        self.apply_precision()
        if config.get('attention')=='sdpa':
            for group in [self.rgb_blocks,self.noise_blocks]:
                for stage in group:
                    for block in stage:block.attn.__class__=FusedAttention
        for branch,group in [('rgb',self.rgb_blocks),('noise',self.noise_blocks)]:
            policy=config.get('attention_policy',{}).get(branch,['exact']*4)
            for stage,mode in zip(group,policy):
                if mode!='exact':
                    for block in stage:block.attn.__class__=ReducedAttention;block.attn.approximation=mode

    def enable_projected_fusion(self):
        self.fusion=nn.ModuleList([ProjectedFusion(f,getattr(self,'v'+str(s))) for s,f in enumerate(self.fusion,1)])
        self.config['project_fusion']=True

    def apply_precision(self):
        dtype=torch.float16 if self.config.get('precision','float32') in ['mixed','half'] else torch.float32
        for group in [self.rgb_patch,self.noise_patch,self.rgb_blocks,self.noise_blocks,self.rgb_norm,self.noise_norm,self.rectify,self.fusion]:group.to(dtype=dtype)
        self.noise.to(dtype=torch.float16 if self.config.get('precision')=='half' else torch.float32)
        for fusion in self.fusion:
            if isinstance(fusion,ProjectedFusion):fusion.residual.float();fusion.finish.float()
        if self.config.get('cross_fp32'):
            for fusion in self.fusion:
                fusion.cross.cross_attn.__class__=FloatContext;fusion.cross.cross_attn.float()

    def features(self,x,noise=None):
        modal=(self.noise(x.to(dtype=next(self.noise.parameters()).dtype)) if noise is None else noise).repeat(1,3,1,1)
        dtype=next(self.rgb_patch.parameters()).dtype
        rgb=((x-self.image_mean)/self.image_scale).to(dtype=dtype);modal=modal.to(dtype=dtype)
        outs=[]
        for stage in range(4):
            r,h,w=self.rgb_patch[stage](rgb);n,hn,wn=self.noise_patch[stage](modal);assert (h,w)==(hn,wn)
            for block in self.rgb_blocks[stage]:r=block(r,h,w)
            for block in self.noise_blocks[stage]:n=block(n,h,w)
            r=self.rgb_norm[stage](r);n=self.noise_norm[stage](n)
            r=r.reshape(x.shape[0],h,w,-1).permute(0,3,1,2).contiguous();n=n.reshape(x.shape[0],h,w,-1).permute(0,3,1,2).contiguous()
            rgb,modal=self.rectify[stage](r,n);outs.append(self.fusion[stage](rgb,modal))
        return outs

    def units(self,features):
        shape=features[0].shape[-2:]
        return torch.relu(sum(F.interpolate(value.float() if self.config.get('project_fusion') else F.conv2d(value.float(),getattr(self,'v'+str(s))),size=shape,mode='bilinear',align_corners=False)
                              for s,value in enumerate(features,1))+self.bias)

    def forward(self,x,return_units=False):
        units=self.units(self.features(x))
        logits=torch.cat([(units*self.read8).sum(1,keepdim=True)+self.read8_bias,units[:,:1]*self.read1+self.read1_bias],1)
        full=F.interpolate(logits,size=x.shape[-2:],mode='bilinear',align_corners=False)
        return (full,units) if return_units else full

    def save(self,path):
        path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
        torch.save(dict(config=self.config,state={k:v.detach().cpu() for k,v in self.state_dict().items()}),path)

    @classmethod
    def load(cls,path,device='mps'):
        bundle=torch.load(path,map_location='cpu',weights_only=True);model=cls(bundle['config'])
        model.load_state_dict(bundle['state']);return model.to(device).eval()


def config(name,rgb=FULL,noise=FULL,precision='float32',npp='folded',**kwargs):
    return dict(name=name,rgb=copy.deepcopy(rgb),noise=copy.deepcopy(noise),precision=precision,npp=npp,**kwargs)
