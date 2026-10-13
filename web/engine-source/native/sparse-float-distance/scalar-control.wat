(module
 (type $0 (func (param i32 i32 i32 i32) (result f64)))
 (type $1 (func (param i32 i32 i32) (result f32)))
 (import "env" "memory" (memory $mimport$0 128 1024))
 (export "sparse_float_distance" (func $0))
 (func $0 (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (result f64)
  (f64.promote_f32
   (f32.demote_f64
    (f64.sqrt
     (f64.promote_f32
      (call $1
       (i32.add
        (local.get $0)
        (i32.shl
         (i32.mul
          (local.get $1)
          (local.get $3)
         )
         (i32.const 2)
        )
       )
       (i32.add
        (local.get $0)
        (i32.shl
         (i32.mul
          (local.get $1)
          (local.get $2)
         )
         (i32.const 2)
        )
       )
       (local.get $1)
      )
     )
    )
   )
  )
 )
 (func $1 (param $0 i32) (param $1 i32) (param $2 i32) (result f32)
  (local $3 f32)
  (local $4 f32)
  (local $5 f32)
  (local $6 f32)
  (local $7 f32)
  (local $8 f32)
  (local $9 f32)
  (local $10 f32)
  (local $11 i32)
  (local $12 i32)
  (local $13 i32)
  (local $14 i32)
  (local $15 i32)
  (block $block
   (if
    (i32.le_s
     (local.get $2)
     (i32.const 7)
    )
    (then
     (if
      (i32.le_s
       (local.get $2)
       (i32.const 0)
      )
      (then
       (return
        (f32.const -0)
       )
      )
     )
     (local.set $3
      (f32.mul
       (local.tee $3
        (f32.sub
         (f32.load
          (local.get $0)
         )
         (f32.load
          (local.get $1)
         )
        )
       )
       (local.get $3)
      )
     )
     (br_if $block
      (i32.eq
       (local.get $2)
       (i32.const 1)
      )
     )
     (local.set $3
      (f32.add
       (local.get $3)
       (f32.mul
        (local.tee $3
         (f32.sub
          (f32.load offset=4
           (local.get $0)
          )
          (f32.load offset=4
           (local.get $1)
          )
         )
        )
        (local.get $3)
       )
      )
     )
     (br_if $block
      (i32.eq
       (local.get $2)
       (i32.const 2)
      )
     )
     (local.set $3
      (f32.add
       (local.get $3)
       (f32.mul
        (local.tee $3
         (f32.sub
          (f32.load offset=8
           (local.get $0)
          )
          (f32.load offset=8
           (local.get $1)
          )
         )
        )
        (local.get $3)
       )
      )
     )
     (br_if $block
      (i32.eq
       (local.get $2)
       (i32.const 3)
      )
     )
     (local.set $3
      (f32.add
       (local.get $3)
       (f32.mul
        (local.tee $3
         (f32.sub
          (f32.load offset=12
           (local.get $0)
          )
          (f32.load offset=12
           (local.get $1)
          )
         )
        )
        (local.get $3)
       )
      )
     )
     (br_if $block
      (i32.eq
       (local.get $2)
       (i32.const 4)
      )
     )
     (local.set $3
      (f32.add
       (local.get $3)
       (f32.mul
        (local.tee $3
         (f32.sub
          (f32.load offset=16
           (local.get $0)
          )
          (f32.load offset=16
           (local.get $1)
          )
         )
        )
        (local.get $3)
       )
      )
     )
     (br_if $block
      (i32.eq
       (local.get $2)
       (i32.const 5)
      )
     )
     (local.set $3
      (f32.add
       (local.get $3)
       (f32.mul
        (local.tee $3
         (f32.sub
          (f32.load offset=20
           (local.get $0)
          )
          (f32.load offset=20
           (local.get $1)
          )
         )
        )
        (local.get $3)
       )
      )
     )
     (br_if $block
      (i32.eq
       (local.get $2)
       (i32.const 6)
      )
     )
     (local.set $3
      (f32.add
       (local.get $3)
       (f32.mul
        (local.tee $3
         (f32.sub
          (f32.load offset=24
           (local.get $0)
          )
          (f32.load offset=24
           (local.get $1)
          )
         )
        )
        (local.get $3)
       )
      )
     )
     (br $block)
    )
   )
   (if
    (i32.le_u
     (local.get $2)
     (i32.const 128)
    )
    (then
     (local.set $3
      (f32.mul
       (local.tee $3
        (f32.sub
         (f32.load offset=28
          (local.get $0)
         )
         (f32.load offset=28
          (local.get $1)
         )
        )
       )
       (local.get $3)
      )
     )
     (local.set $4
      (f32.mul
       (local.tee $4
        (f32.sub
         (f32.load offset=24
          (local.get $0)
         )
         (f32.load offset=24
          (local.get $1)
         )
        )
       )
       (local.get $4)
      )
     )
     (local.set $5
      (f32.mul
       (local.tee $5
        (f32.sub
         (f32.load offset=20
          (local.get $0)
         )
         (f32.load offset=20
          (local.get $1)
         )
        )
       )
       (local.get $5)
      )
     )
     (local.set $6
      (f32.mul
       (local.tee $6
        (f32.sub
         (f32.load offset=16
          (local.get $0)
         )
         (f32.load offset=16
          (local.get $1)
         )
        )
       )
       (local.get $6)
      )
     )
     (local.set $7
      (f32.mul
       (local.tee $7
        (f32.sub
         (f32.load offset=12
          (local.get $0)
         )
         (f32.load offset=12
          (local.get $1)
         )
        )
       )
       (local.get $7)
      )
     )
     (local.set $8
      (f32.mul
       (local.tee $8
        (f32.sub
         (f32.load offset=8
          (local.get $0)
         )
         (f32.load offset=8
          (local.get $1)
         )
        )
       )
       (local.get $8)
      )
     )
     (local.set $9
      (f32.mul
       (local.tee $9
        (f32.sub
         (f32.load offset=4
          (local.get $0)
         )
         (f32.load offset=4
          (local.get $1)
         )
        )
       )
       (local.get $9)
      )
     )
     (local.set $10
      (f32.mul
       (local.tee $10
        (f32.sub
         (f32.load
          (local.get $0)
         )
         (f32.load
          (local.get $1)
         )
        )
       )
       (local.get $10)
      )
     )
     (local.set $11
      (i32.const 8)
     )
     (if
      (i32.ge_u
       (local.tee $15
        (i32.and
         (local.get $2)
         (i32.const 248)
        )
       )
       (i32.const 9)
      )
      (then
       (local.set $14
        (i32.const 8)
       )
       (loop $label
        (local.set $3
         (f32.add
          (local.get $3)
          (f32.mul
           (local.tee $3
            (f32.sub
             (f32.load
              (i32.add
               (local.tee $11
                (i32.add
                 (local.get $0)
                 (local.get $12)
                )
               )
               (i32.const 60)
              )
             )
             (f32.load
              (i32.add
               (local.tee $13
                (i32.add
                 (local.get $1)
                 (local.get $12)
                )
               )
               (i32.const 60)
              )
             )
            )
           )
           (local.get $3)
          )
         )
        )
        (local.set $4
         (f32.add
          (local.get $4)
          (f32.mul
           (local.tee $4
            (f32.sub
             (f32.load
              (i32.add
               (local.get $11)
               (i32.const 56)
              )
             )
             (f32.load
              (i32.add
               (local.get $13)
               (i32.const 56)
              )
             )
            )
           )
           (local.get $4)
          )
         )
        )
        (local.set $5
         (f32.add
          (local.get $5)
          (f32.mul
           (local.tee $5
            (f32.sub
             (f32.load
              (i32.add
               (local.get $11)
               (i32.const 52)
              )
             )
             (f32.load
              (i32.add
               (local.get $13)
               (i32.const 52)
              )
             )
            )
           )
           (local.get $5)
          )
         )
        )
        (local.set $6
         (f32.add
          (local.get $6)
          (f32.mul
           (local.tee $6
            (f32.sub
             (f32.load
              (i32.add
               (local.get $11)
               (i32.const 48)
              )
             )
             (f32.load
              (i32.add
               (local.get $13)
               (i32.const 48)
              )
             )
            )
           )
           (local.get $6)
          )
         )
        )
        (local.set $7
         (f32.add
          (local.get $7)
          (f32.mul
           (local.tee $7
            (f32.sub
             (f32.load
              (i32.add
               (local.get $11)
               (i32.const 44)
              )
             )
             (f32.load
              (i32.add
               (local.get $13)
               (i32.const 44)
              )
             )
            )
           )
           (local.get $7)
          )
         )
        )
        (local.set $8
         (f32.add
          (local.get $8)
          (f32.mul
           (local.tee $8
            (f32.sub
             (f32.load
              (i32.add
               (local.get $11)
               (i32.const 40)
              )
             )
             (f32.load
              (i32.add
               (local.get $13)
               (i32.const 40)
              )
             )
            )
           )
           (local.get $8)
          )
         )
        )
        (local.set $9
         (f32.add
          (local.get $9)
          (f32.mul
           (local.tee $9
            (f32.sub
             (f32.load
              (i32.add
               (local.get $11)
               (i32.const 36)
              )
             )
             (f32.load
              (i32.add
               (local.get $13)
               (i32.const 36)
              )
             )
            )
           )
           (local.get $9)
          )
         )
        )
        (local.set $10
         (f32.add
          (local.get $10)
          (f32.mul
           (local.tee $10
            (f32.sub
             (f32.load
              (i32.add
               (local.get $11)
               (i32.const 32)
              )
             )
             (f32.load
              (i32.add
               (local.get $13)
               (i32.const 32)
              )
             )
            )
           )
           (local.get $10)
          )
         )
        )
        (local.set $12
         (i32.add
          (local.get $12)
          (i32.const 32)
         )
        )
        (br_if $label
         (i32.lt_u
          (local.tee $14
           (i32.add
            (local.get $14)
            (i32.const 8)
           )
          )
          (local.get $15)
         )
        )
       )
       (local.set $11
        (i32.and
         (local.get $2)
         (i32.const 248)
        )
       )
      )
     )
     (local.set $3
      (f32.add
       (f32.add
        (f32.add
         (local.get $10)
         (local.get $9)
        )
        (f32.add
         (local.get $8)
         (local.get $7)
        )
       )
       (f32.add
        (f32.add
         (local.get $6)
         (local.get $5)
        )
        (f32.add
         (local.get $4)
         (local.get $3)
        )
       )
      )
     )
     (br_if $block
      (i32.le_u
       (local.get $2)
       (local.get $11)
      )
     )
     (local.set $12
      (i32.or
       (local.get $11)
       (i32.const 1)
      )
     )
     (if
      (i32.and
       (local.get $2)
       (i32.const 1)
      )
      (then
       (local.set $3
        (f32.add
         (local.get $3)
         (f32.mul
          (local.tee $3
           (f32.sub
            (f32.load
             (i32.add
              (local.get $0)
              (local.tee $11
               (i32.shl
                (local.get $11)
                (i32.const 2)
               )
              )
             )
            )
            (f32.load
             (i32.add
              (local.get $1)
              (local.get $11)
             )
            )
           )
          )
          (local.get $3)
         )
        )
       )
       (local.set $11
        (local.get $12)
       )
      )
     )
     (br_if $block
      (i32.eq
       (local.get $2)
       (local.get $12)
      )
     )
     (local.set $12
      (i32.sub
       (local.get $2)
       (local.get $11)
      )
     )
     (local.set $11
      (i32.add
       (local.get $0)
       (local.tee $2
        (i32.shl
         (local.get $11)
         (i32.const 2)
        )
       )
      )
     )
     (local.set $0
      (i32.add
       (local.get $1)
       (local.get $2)
      )
     )
     (loop $label1
      (local.set $3
       (f32.add
        (f32.add
         (local.get $3)
         (f32.mul
          (local.tee $3
           (f32.sub
            (f32.load
             (local.get $11)
            )
            (f32.load
             (local.get $0)
            )
           )
          )
          (local.get $3)
         )
        )
        (f32.mul
         (local.tee $3
          (f32.sub
           (f32.load
            (i32.add
             (local.get $11)
             (i32.const 4)
            )
           )
           (f32.load
            (i32.add
             (local.get $0)
             (i32.const 4)
            )
           )
          )
         )
         (local.get $3)
        )
       )
      )
      (local.set $11
       (i32.add
        (local.get $11)
        (i32.const 8)
       )
      )
      (local.set $0
       (i32.add
        (local.get $0)
        (i32.const 8)
       )
      )
      (br_if $label1
       (local.tee $12
        (i32.sub
         (local.get $12)
         (i32.const 2)
        )
       )
      )
     )
     (br $block)
    )
   )
   (return
    (f32.add
     (call $1
      (local.get $0)
      (local.get $1)
      (local.tee $11
       (i32.and
        (i32.shr_u
         (local.get $2)
         (i32.const 1)
        )
        (i32.const 1073741816)
       )
      )
     )
     (call $1
      (i32.add
       (local.get $0)
       (local.tee $12
        (i32.shl
         (local.get $11)
         (i32.const 2)
        )
       )
      )
      (i32.add
       (local.get $1)
       (local.get $12)
      )
      (i32.sub
       (local.get $2)
       (local.get $11)
      )
     )
    )
   )
  )
  (local.get $3)
 )
 ;; custom section "producers", size 110
 ;; features section: mutable-globals, nontrapping-float-to-int, simd, bulk-memory, sign-ext, reference-types, multivalue, bulk-memory-opt, call-indirect-overlong
)

