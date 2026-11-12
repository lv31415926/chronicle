/* manifest.js | 明史编年层分片清单
 *
 * 由 tools/mingshi-annals.mjs 生成，请勿手改。装载层只按此表注入分片。
 * 逐卷抽取账 census.perJuan：j 卷次｜s 部类｜n 节点数｜merged 并入前句数｜chars 底本字数
 * 节点字段：i 编号｜y 公元年｜m 月(0=未记)｜L 闰｜g 干支日｜w 以年计(是年)｜j 卷次｜s 部类｜
 *          a 系年来源(b=本纪连续/s=句内自标)｜e 年号｜k 类别｜q 原文
 */
window.__CHRONICLE_ANNALS_MANIFEST = {
 "version": 1,
 "label": "明史编年层",
 "census": {
  "nodes": 7535,
  "years": 311,
  "from": 1272,
  "to": 1644,
  "bySection": {
   "zhi": 1553,
   "zhuan": 308,
   "ji": 5674
  },
  "byKind": {
   "guan": 860,
   "za": 2492,
   "bing": 1288,
   "sang": 211,
   "li": 1096,
   "cai": 173,
   "zai": 907,
   "si": 508
  },
  "byAnchor": {
   "s": 2185,
   "b": 5350
  },
  "merged": 1181,
  "droppedNoAnchor": 137426,
  "mergeConflict": 141,
  "overLong": 13,
  "commentary": 185,
  "bytes": 1388761,
  "perJuan": [
   {
    "j": 1,
    "s": "ji",
    "n": 159,
    "merged": 123,
    "chars": 7375
   },
   {
    "j": 2,
    "s": "ji",
    "n": 362,
    "merged": 106,
    "chars": 8830
   },
   {
    "j": 3,
    "s": "ji",
    "n": 322,
    "merged": 61,
    "chars": 8157
   },
   {
    "j": 4,
    "s": "ji",
    "n": 91,
    "merged": 79,
    "chars": 3785
   },
   {
    "j": 5,
    "s": "ji",
    "n": 88,
    "merged": 91,
    "chars": 3961
   },
   {
    "j": 6,
    "s": "ji",
    "n": 281,
    "merged": 49,
    "chars": 6017
   },
   {
    "j": 7,
    "s": "ji",
    "n": 230,
    "merged": 37,
    "chars": 5671
   },
   {
    "j": 8,
    "s": "ji",
    "n": 70,
    "merged": 22,
    "chars": 2882
   },
   {
    "j": 9,
    "s": "ji",
    "n": 235,
    "merged": 26,
    "chars": 4829
   },
   {
    "j": 10,
    "s": "ji",
    "n": 273,
    "merged": 30,
    "chars": 5432
   },
   {
    "j": 11,
    "s": "ji",
    "n": 216,
    "merged": 35,
    "chars": 4406
   },
   {
    "j": 12,
    "s": "ji",
    "n": 158,
    "merged": 19,
    "chars": 3078
   },
   {
    "j": 13,
    "s": "ji",
    "n": 172,
    "merged": 28,
    "chars": 3437
   },
   {
    "j": 14,
    "s": "ji",
    "n": 164,
    "merged": 19,
    "chars": 3267
   },
   {
    "j": 15,
    "s": "ji",
    "n": 285,
    "merged": 33,
    "chars": 5710
   },
   {
    "j": 16,
    "s": "ji",
    "n": 306,
    "merged": 34,
    "chars": 5909
   },
   {
    "j": 17,
    "s": "ji",
    "n": 393,
    "merged": 44,
    "chars": 6881
   },
   {
    "j": 18,
    "s": "ji",
    "n": 329,
    "merged": 34,
    "chars": 6004
   },
   {
    "j": 19,
    "s": "ji",
    "n": 123,
    "merged": 18,
    "chars": 2312
   },
   {
    "j": 20,
    "s": "ji",
    "n": 362,
    "merged": 42,
    "chars": 6652
   },
   {
    "j": 21,
    "s": "ji",
    "n": 296,
    "merged": 61,
    "chars": 6178
   },
   {
    "j": 22,
    "s": "ji",
    "n": 209,
    "merged": 52,
    "chars": 4582
   },
   {
    "j": 23,
    "s": "ji",
    "n": 305,
    "merged": 46,
    "chars": 6133
   },
   {
    "j": 24,
    "s": "ji",
    "n": 245,
    "merged": 55,
    "chars": 5341
   },
   {
    "j": 25,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 10200
   },
   {
    "j": 26,
    "s": "zhi",
    "n": 109,
    "merged": 0,
    "chars": 12677
   },
   {
    "j": 27,
    "s": "zhi",
    "n": 107,
    "merged": 0,
    "chars": 12047
   },
   {
    "j": 28,
    "s": "zhi",
    "n": 124,
    "merged": 0,
    "chars": 16552
   },
   {
    "j": 29,
    "s": "zhi",
    "n": 67,
    "merged": 0,
    "chars": 9352
   },
   {
    "j": 30,
    "s": "zhi",
    "n": 84,
    "merged": 0,
    "chars": 16238
   },
   {
    "j": 31,
    "s": "zhi",
    "n": 2,
    "merged": 0,
    "chars": 16442
   },
   {
    "j": 32,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 4221
   },
   {
    "j": 33,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 9622
   },
   {
    "j": 35,
    "s": "zhi",
    "n": 1,
    "merged": 0,
    "chars": 8798
   },
   {
    "j": 36,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 7895
   },
   {
    "j": 37,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 9299
   },
   {
    "j": 38,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 3222
   },
   {
    "j": 40,
    "s": "zhi",
    "n": 137,
    "merged": 3,
    "chars": 26210
   },
   {
    "j": 41,
    "s": "zhi",
    "n": 93,
    "merged": 3,
    "chars": 18869
   },
   {
    "j": 42,
    "s": "zhi",
    "n": 136,
    "merged": 3,
    "chars": 20733
   },
   {
    "j": 43,
    "s": "zhi",
    "n": 149,
    "merged": 4,
    "chars": 23823
   },
   {
    "j": 44,
    "s": "zhi",
    "n": 106,
    "merged": 3,
    "chars": 24251
   },
   {
    "j": 45,
    "s": "zhi",
    "n": 106,
    "merged": 5,
    "chars": 24181
   },
   {
    "j": 46,
    "s": "zhi",
    "n": 266,
    "merged": 6,
    "chars": 23187
   },
   {
    "j": 47,
    "s": "zhi",
    "n": 1,
    "merged": 0,
    "chars": 10115
   },
   {
    "j": 48,
    "s": "zhi",
    "n": 1,
    "merged": 0,
    "chars": 8914
   },
   {
    "j": 49,
    "s": "zhi",
    "n": 2,
    "merged": 0,
    "chars": 10861
   },
   {
    "j": 50,
    "s": "zhi",
    "n": 1,
    "merged": 0,
    "chars": 10421
   },
   {
    "j": 51,
    "s": "zhi",
    "n": 7,
    "merged": 0,
    "chars": 8131
   },
   {
    "j": 52,
    "s": "zhi",
    "n": 1,
    "merged": 0,
    "chars": 6355
   },
   {
    "j": 53,
    "s": "zhi",
    "n": 4,
    "merged": 0,
    "chars": 9659
   },
   {
    "j": 54,
    "s": "zhi",
    "n": 4,
    "merged": 0,
    "chars": 10053
   },
   {
    "j": 55,
    "s": "zhi",
    "n": 1,
    "merged": 0,
    "chars": 10354
   },
   {
    "j": 56,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 8569
   },
   {
    "j": 57,
    "s": "zhi",
    "n": 6,
    "merged": 0,
    "chars": 5175
   },
   {
    "j": 58,
    "s": "zhi",
    "n": 1,
    "merged": 0,
    "chars": 4237
   },
   {
    "j": 59,
    "s": "zhi",
    "n": 4,
    "merged": 0,
    "chars": 7184
   },
   {
    "j": 60,
    "s": "zhi",
    "n": 6,
    "merged": 0,
    "chars": 12553
   },
   {
    "j": 61,
    "s": "zhi",
    "n": 1,
    "merged": 0,
    "chars": 9598
   },
   {
    "j": 62,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 13348
   },
   {
    "j": 63,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 12446
   },
   {
    "j": 64,
    "s": "zhi",
    "n": 1,
    "merged": 0,
    "chars": 4594
   },
   {
    "j": 65,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 7681
   },
   {
    "j": 66,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 8037
   },
   {
    "j": 67,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 11359
   },
   {
    "j": 68,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 7984
   },
   {
    "j": 69,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 8584
   },
   {
    "j": 70,
    "s": "zhi",
    "n": 6,
    "merged": 0,
    "chars": 8280
   },
   {
    "j": 71,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 8605
   },
   {
    "j": 72,
    "s": "zhi",
    "n": 2,
    "merged": 0,
    "chars": 19592
   },
   {
    "j": 73,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 13743
   },
   {
    "j": 74,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 20704
   },
   {
    "j": 75,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 12307
   },
   {
    "j": 76,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 11458
   },
   {
    "j": 77,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 6483
   },
   {
    "j": 78,
    "s": "zhi",
    "n": 1,
    "merged": 0,
    "chars": 8950
   },
   {
    "j": 79,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 7907
   },
   {
    "j": 80,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 12748
   },
   {
    "j": 81,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 11969
   },
   {
    "j": 82,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 11078
   },
   {
    "j": 83,
    "s": "zhi",
    "n": 2,
    "merged": 0,
    "chars": 15751
   },
   {
    "j": 84,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 14445
   },
   {
    "j": 85,
    "s": "zhi",
    "n": 3,
    "merged": 1,
    "chars": 12803
   },
   {
    "j": 86,
    "s": "zhi",
    "n": 1,
    "merged": 0,
    "chars": 7629
   },
   {
    "j": 87,
    "s": "zhi",
    "n": 4,
    "merged": 0,
    "chars": 12344
   },
   {
    "j": 88,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 14897
   },
   {
    "j": 89,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 8908
   },
   {
    "j": 90,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 14488
   },
   {
    "j": 91,
    "s": "zhi",
    "n": 1,
    "merged": 0,
    "chars": 9751
   },
   {
    "j": 92,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 12155
   },
   {
    "j": 93,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 13245
   },
   {
    "j": 94,
    "s": "zhi",
    "n": 4,
    "merged": 0,
    "chars": 12289
   },
   {
    "j": 95,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 7201
   },
   {
    "j": 96,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 11832
   },
   {
    "j": 97,
    "s": "zhi",
    "n": 1,
    "merged": 0,
    "chars": 16222
   },
   {
    "j": 98,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 11622
   },
   {
    "j": 99,
    "s": "zhi",
    "n": 0,
    "merged": 0,
    "chars": 14964
   },
   {
    "j": 113,
    "s": "zhuan",
    "n": 14,
    "merged": 0,
    "chars": 10674
   },
   {
    "j": 114,
    "s": "zhuan",
    "n": 10,
    "merged": 1,
    "chars": 9201
   },
   {
    "j": 115,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 4057
   },
   {
    "j": 116,
    "s": "zhuan",
    "n": 4,
    "merged": 0,
    "chars": 10792
   },
   {
    "j": 117,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 10386
   },
   {
    "j": 118,
    "s": "zhuan",
    "n": 4,
    "merged": 1,
    "chars": 10726
   },
   {
    "j": 119,
    "s": "zhuan",
    "n": 8,
    "merged": 1,
    "chars": 8718
   },
   {
    "j": 120,
    "s": "zhuan",
    "n": 4,
    "merged": 0,
    "chars": 6637
   },
   {
    "j": 121,
    "s": "zhuan",
    "n": 3,
    "merged": 0,
    "chars": 6689
   },
   {
    "j": 122,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 3244
   },
   {
    "j": 123,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 10263
   },
   {
    "j": 124,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 6222
   },
   {
    "j": 125,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 8457
   },
   {
    "j": 126,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 13368
   },
   {
    "j": 127,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 3125
   },
   {
    "j": 128,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 8239
   },
   {
    "j": 129,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 8770
   },
   {
    "j": 130,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 10993
   },
   {
    "j": 131,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 8054
   },
   {
    "j": 132,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 6091
   },
   {
    "j": 133,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 10565
   },
   {
    "j": 134,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 6944
   },
   {
    "j": 135,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 5259
   },
   {
    "j": 136,
    "s": "zhuan",
    "n": 2,
    "merged": 1,
    "chars": 6950
   },
   {
    "j": 137,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 9522
   },
   {
    "j": 138,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 7617
   },
   {
    "j": 139,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 9337
   },
   {
    "j": 140,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 4543
   },
   {
    "j": 141,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 7570
   },
   {
    "j": 142,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 5888
   },
   {
    "j": 143,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 8016
   },
   {
    "j": 144,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 5254
   },
   {
    "j": 145,
    "s": "zhuan",
    "n": 5,
    "merged": 0,
    "chars": 8937
   },
   {
    "j": 146,
    "s": "zhuan",
    "n": 8,
    "merged": 3,
    "chars": 6007
   },
   {
    "j": 147,
    "s": "zhuan",
    "n": 4,
    "merged": 0,
    "chars": 7284
   },
   {
    "j": 148,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 7445
   },
   {
    "j": 149,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 4666
   },
   {
    "j": 150,
    "s": "zhuan",
    "n": 3,
    "merged": 0,
    "chars": 6407
   },
   {
    "j": 151,
    "s": "zhuan",
    "n": 3,
    "merged": 0,
    "chars": 5820
   },
   {
    "j": 152,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 6293
   },
   {
    "j": 153,
    "s": "zhuan",
    "n": 1,
    "merged": 1,
    "chars": 7628
   },
   {
    "j": 154,
    "s": "zhuan",
    "n": 4,
    "merged": 0,
    "chars": 11560
   },
   {
    "j": 155,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 9674
   },
   {
    "j": 156,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 6702
   },
   {
    "j": 157,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 8735
   },
   {
    "j": 158,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 7990
   },
   {
    "j": 159,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 10700
   },
   {
    "j": 160,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 7225
   },
   {
    "j": 161,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 10020
   },
   {
    "j": 162,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 10961
   },
   {
    "j": 163,
    "s": "zhuan",
    "n": 3,
    "merged": 0,
    "chars": 5815
   },
   {
    "j": 164,
    "s": "zhuan",
    "n": 4,
    "merged": 0,
    "chars": 12594
   },
   {
    "j": 165,
    "s": "zhuan",
    "n": 4,
    "merged": 0,
    "chars": 6382
   },
   {
    "j": 166,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 8854
   },
   {
    "j": 167,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 5048
   },
   {
    "j": 168,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 9087
   },
   {
    "j": 169,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 4521
   },
   {
    "j": 170,
    "s": "zhuan",
    "n": 3,
    "merged": 0,
    "chars": 5287
   },
   {
    "j": 171,
    "s": "zhuan",
    "n": 3,
    "merged": 0,
    "chars": 11182
   },
   {
    "j": 172,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 12317
   },
   {
    "j": 173,
    "s": "zhuan",
    "n": 3,
    "merged": 0,
    "chars": 11008
   },
   {
    "j": 174,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 10206
   },
   {
    "j": 175,
    "s": "zhuan",
    "n": 4,
    "merged": 0,
    "chars": 7360
   },
   {
    "j": 176,
    "s": "zhuan",
    "n": 5,
    "merged": 0,
    "chars": 11894
   },
   {
    "j": 177,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 12891
   },
   {
    "j": 178,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 9920
   },
   {
    "j": 179,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 7750
   },
   {
    "j": 180,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 17644
   },
   {
    "j": 181,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 12134
   },
   {
    "j": 182,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 9926
   },
   {
    "j": 183,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 9845
   },
   {
    "j": 184,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 8444
   },
   {
    "j": 185,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 8982
   },
   {
    "j": 186,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 15605
   },
   {
    "j": 187,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 11294
   },
   {
    "j": 188,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 15932
   },
   {
    "j": 189,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 10160
   },
   {
    "j": 190,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 10454
   },
   {
    "j": 191,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 13091
   },
   {
    "j": 192,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 11559
   },
   {
    "j": 193,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 10626
   },
   {
    "j": 194,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 12944
   },
   {
    "j": 195,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 6209
   },
   {
    "j": 196,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 14217
   },
   {
    "j": 197,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 11618
   },
   {
    "j": 198,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 14150
   },
   {
    "j": 199,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 9782
   },
   {
    "j": 200,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 12398
   },
   {
    "j": 201,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 7757
   },
   {
    "j": 202,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 12164
   },
   {
    "j": 203,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 11986
   },
   {
    "j": 204,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 11631
   },
   {
    "j": 205,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 11099
   },
   {
    "j": 206,
    "s": "zhuan",
    "n": 3,
    "merged": 0,
    "chars": 14646
   },
   {
    "j": 207,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 10383
   },
   {
    "j": 208,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 13014
   },
   {
    "j": 209,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 15084
   },
   {
    "j": 210,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 12150
   },
   {
    "j": 211,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 11530
   },
   {
    "j": 212,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 13555
   },
   {
    "j": 213,
    "s": "zhuan",
    "n": 2,
    "merged": 1,
    "chars": 12178
   },
   {
    "j": 214,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 8576
   },
   {
    "j": 215,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 8443
   },
   {
    "j": 216,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 14188
   },
   {
    "j": 217,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 8603
   },
   {
    "j": 218,
    "s": "zhuan",
    "n": 3,
    "merged": 0,
    "chars": 10824
   },
   {
    "j": 219,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 6334
   },
   {
    "j": 220,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 12473
   },
   {
    "j": 221,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 9233
   },
   {
    "j": 222,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 14878
   },
   {
    "j": 223,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 11482
   },
   {
    "j": 224,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 11446
   },
   {
    "j": 225,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 7131
   },
   {
    "j": 226,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 11130
   },
   {
    "j": 227,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 10741
   },
   {
    "j": 228,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 6591
   },
   {
    "j": 229,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 9289
   },
   {
    "j": 230,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 8951
   },
   {
    "j": 231,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 11694
   },
   {
    "j": 232,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 6430
   },
   {
    "j": 233,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 9632
   },
   {
    "j": 234,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 11451
   },
   {
    "j": 235,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 10703
   },
   {
    "j": 236,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 11566
   },
   {
    "j": 237,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 6624
   },
   {
    "j": 238,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 10275
   },
   {
    "j": 239,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 12375
   },
   {
    "j": 240,
    "s": "zhuan",
    "n": 5,
    "merged": 0,
    "chars": 12731
   },
   {
    "j": 241,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 9465
   },
   {
    "j": 242,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 7717
   },
   {
    "j": 243,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 10113
   },
   {
    "j": 244,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 14802
   },
   {
    "j": 245,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 10554
   },
   {
    "j": 246,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 7413
   },
   {
    "j": 247,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 13198
   },
   {
    "j": 248,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 9692
   },
   {
    "j": 249,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 12272
   },
   {
    "j": 250,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 6772
   },
   {
    "j": 251,
    "s": "zhuan",
    "n": 3,
    "merged": 0,
    "chars": 13936
   },
   {
    "j": 252,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 8461
   },
   {
    "j": 253,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 10884
   },
   {
    "j": 254,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 8664
   },
   {
    "j": 255,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 15470
   },
   {
    "j": 256,
    "s": "zhuan",
    "n": 3,
    "merged": 0,
    "chars": 5678
   },
   {
    "j": 257,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 12729
   },
   {
    "j": 258,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 18817
   },
   {
    "j": 259,
    "s": "zhuan",
    "n": 3,
    "merged": 0,
    "chars": 20426
   },
   {
    "j": 260,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 15483
   },
   {
    "j": 261,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 7091
   },
   {
    "j": 262,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 9217
   },
   {
    "j": 263,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 8591
   },
   {
    "j": 264,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 7579
   },
   {
    "j": 265,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 10538
   },
   {
    "j": 266,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 9314
   },
   {
    "j": 267,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 6566
   },
   {
    "j": 268,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 5505
   },
   {
    "j": 269,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 13039
   },
   {
    "j": 270,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 8382
   },
   {
    "j": 271,
    "s": "zhuan",
    "n": 6,
    "merged": 0,
    "chars": 9240
   },
   {
    "j": 272,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 5876
   },
   {
    "j": 273,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 12554
   },
   {
    "j": 274,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 9889
   },
   {
    "j": 275,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 8812
   },
   {
    "j": 276,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 12810
   },
   {
    "j": 277,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 12308
   },
   {
    "j": 278,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 12407
   },
   {
    "j": 279,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 13930
   },
   {
    "j": 280,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 7174
   },
   {
    "j": 281,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 14631
   },
   {
    "j": 282,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 17977
   },
   {
    "j": 283,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 15099
   },
   {
    "j": 284,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 4577
   },
   {
    "j": 285,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 12716
   },
   {
    "j": 286,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 11495
   },
   {
    "j": 287,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 10550
   },
   {
    "j": 288,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 9772
   },
   {
    "j": 289,
    "s": "zhuan",
    "n": 5,
    "merged": 0,
    "chars": 12368
   },
   {
    "j": 290,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 7812
   },
   {
    "j": 291,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 10916
   },
   {
    "j": 292,
    "s": "zhuan",
    "n": 3,
    "merged": 0,
    "chars": 9985
   },
   {
    "j": 293,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 9285
   },
   {
    "j": 294,
    "s": "zhuan",
    "n": 3,
    "merged": 0,
    "chars": 12458
   },
   {
    "j": 295,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 9152
   },
   {
    "j": 296,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 9975
   },
   {
    "j": 297,
    "s": "zhuan",
    "n": 3,
    "merged": 0,
    "chars": 10468
   },
   {
    "j": 298,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 3898
   },
   {
    "j": 299,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 11575
   },
   {
    "j": 300,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 12137
   },
   {
    "j": 301,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 10525
   },
   {
    "j": 302,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 9965
   },
   {
    "j": 303,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 10579
   },
   {
    "j": 304,
    "s": "zhuan",
    "n": 7,
    "merged": 0,
    "chars": 15203
   },
   {
    "j": 305,
    "s": "zhuan",
    "n": 7,
    "merged": 0,
    "chars": 16335
   },
   {
    "j": 306,
    "s": "zhuan",
    "n": 5,
    "merged": 0,
    "chars": 20319
   },
   {
    "j": 307,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 14737
   },
   {
    "j": 308,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 21436
   },
   {
    "j": 309,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 16211
   },
   {
    "j": 310,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 9403
   },
   {
    "j": 311,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 17687
   },
   {
    "j": 312,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 11299
   },
   {
    "j": 313,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 11384
   },
   {
    "j": 314,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 16349
   },
   {
    "j": 315,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 16873
   },
   {
    "j": 316,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 15372
   },
   {
    "j": 317,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 12761
   },
   {
    "j": 318,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 12692
   },
   {
    "j": 319,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 9562
   },
   {
    "j": 320,
    "s": "zhuan",
    "n": 8,
    "merged": 0,
    "chars": 15172
   },
   {
    "j": 321,
    "s": "zhuan",
    "n": 3,
    "merged": 0,
    "chars": 16777
   },
   {
    "j": 322,
    "s": "zhuan",
    "n": 5,
    "merged": 0,
    "chars": 9600
   },
   {
    "j": 323,
    "s": "zhuan",
    "n": 9,
    "merged": 0,
    "chars": 10042
   },
   {
    "j": 324,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 13234
   },
   {
    "j": 325,
    "s": "zhuan",
    "n": 3,
    "merged": 0,
    "chars": 12842
   },
   {
    "j": 326,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 9532
   },
   {
    "j": 327,
    "s": "zhuan",
    "n": 3,
    "merged": 0,
    "chars": 17607
   },
   {
    "j": 328,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 6689
   },
   {
    "j": 329,
    "s": "zhuan",
    "n": 2,
    "merged": 0,
    "chars": 13290
   },
   {
    "j": 330,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 14664
   },
   {
    "j": 331,
    "s": "zhuan",
    "n": 0,
    "merged": 0,
    "chars": 11938
   },
   {
    "j": 332,
    "s": "zhuan",
    "n": 1,
    "merged": 0,
    "chars": 13899
   }
  ]
 },
 "chunks": [
  {
   "id": "ji-1320",
   "file": "annals-ji-1320.js",
   "count": 40,
   "bytes": 11324,
   "yearFrom": 1352,
   "yearTo": 1359
  },
  {
   "id": "ji-1360",
   "file": "annals-ji-1360.js",
   "count": 853,
   "bytes": 169432,
   "yearFrom": 1360,
   "yearTo": 1399
  },
  {
   "id": "ji-1400",
   "file": "annals-ji-1400.js",
   "count": 1027,
   "bytes": 196569,
   "yearFrom": 1400,
   "yearTo": 1439
  },
  {
   "id": "ji-1440",
   "file": "annals-ji-1440.js",
   "count": 792,
   "bytes": 141947,
   "yearFrom": 1440,
   "yearTo": 1479
  },
  {
   "id": "ji-1480",
   "file": "annals-ji-1480.js",
   "count": 675,
   "bytes": 120969,
   "yearFrom": 1480,
   "yearTo": 1519
  },
  {
   "id": "ji-1520",
   "file": "annals-ji-1520.js",
   "count": 667,
   "bytes": 117862,
   "yearFrom": 1520,
   "yearTo": 1559
  },
  {
   "id": "ji-1560",
   "file": "annals-ji-1560.js",
   "count": 616,
   "bytes": 109760,
   "yearFrom": 1560,
   "yearTo": 1599
  },
  {
   "id": "ji-1600",
   "file": "annals-ji-1600.js",
   "count": 808,
   "bytes": 148753,
   "yearFrom": 1600,
   "yearTo": 1639
  },
  {
   "id": "ji-1640",
   "file": "annals-ji-1640.js",
   "count": 196,
   "bytes": 36715,
   "yearFrom": 1640,
   "yearTo": 1644
  },
  {
   "id": "zhi-1260",
   "file": "annals-zhi-1260.js",
   "count": 11,
   "bytes": 2202,
   "yearFrom": 1272,
   "yearTo": 1317
  },
  {
   "id": "zhi-1320",
   "file": "annals-zhi-1320.js",
   "count": 417,
   "bytes": 67285,
   "yearFrom": 1324,
   "yearTo": 1378
  },
  {
   "id": "zhi-1380",
   "file": "annals-zhi-1380.js",
   "count": 469,
   "bytes": 81279,
   "yearFrom": 1380,
   "yearTo": 1439
  },
  {
   "id": "zhi-1440",
   "file": "annals-zhi-1440.js",
   "count": 259,
   "bytes": 46951,
   "yearFrom": 1440,
   "yearTo": 1498
  },
  {
   "id": "zhi-1500",
   "file": "annals-zhi-1500.js",
   "count": 156,
   "bytes": 29868,
   "yearFrom": 1500,
   "yearTo": 1559
  },
  {
   "id": "zhi-1560",
   "file": "annals-zhi-1560.js",
   "count": 164,
   "bytes": 30220,
   "yearFrom": 1560,
   "yearTo": 1619
  },
  {
   "id": "zhi-1620",
   "file": "annals-zhi-1620.js",
   "count": 77,
   "bytes": 14289,
   "yearFrom": 1620,
   "yearTo": 1643
  },
  {
   "id": "zhuan-1320",
   "file": "annals-zhuan-1320.js",
   "count": 22,
   "bytes": 5129,
   "yearFrom": 1351,
   "yearTo": 1376
  },
  {
   "id": "zhuan-1380",
   "file": "annals-zhuan-1380.js",
   "count": 73,
   "bytes": 13614,
   "yearFrom": 1381,
   "yearTo": 1438
  },
  {
   "id": "zhuan-1440",
   "file": "annals-zhuan-1440.js",
   "count": 68,
   "bytes": 13847,
   "yearFrom": 1440,
   "yearTo": 1496
  },
  {
   "id": "zhuan-1500",
   "file": "annals-zhuan-1500.js",
   "count": 44,
   "bytes": 9072,
   "yearFrom": 1501,
   "yearTo": 1559
  },
  {
   "id": "zhuan-1560",
   "file": "annals-zhuan-1560.js",
   "count": 30,
   "bytes": 6488,
   "yearFrom": 1567,
   "yearTo": 1619
  },
  {
   "id": "zhuan-1620",
   "file": "annals-zhuan-1620.js",
   "count": 71,
   "bytes": 15186,
   "yearFrom": 1620,
   "yearTo": 1644
  }
 ]
};
